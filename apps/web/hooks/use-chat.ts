'use client'

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, ToolCall, ChatStreamChunk } from '@floow/core-finance'

interface UseChatOptions {
  insightId?: string
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    setError(null)
    setIsStreaming(true)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, assistantMsg])

    try {
      abortRef.current = new AbortController()

      const response = await fetch('/api/cfo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          insightId: options?.insightId,
          message: text,
          history: options?.insightId ? messages.concat(userMsg) : undefined,
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.message || err.error || 'Erro ao conectar')
      }

      const newConvId = response.headers.get('X-Conversation-Id')
      if (newConvId) setConversationId(newConvId)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const chunk: ChatStreamChunk = JSON.parse(line.slice(6))
            if (chunk.type === 'text' && chunk.text) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + chunk.text }
                }
                return updated
              })
            } else if (chunk.type === 'tool_call' && chunk.toolCall) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolCall: chunk.toolCall }
                }
                return updated
              })
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Erro ao conectar com o consultor. Tente novamente.')
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [conversationId, messages, options?.insightId])

  const confirmAction = useCallback(async (toolCall: ToolCall) => {
    try {
      const response = await fetch('/api/cfo/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, toolCall }),
      })
      const result = await response.json()

      const toolResultMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'tool_result',
        content: result.message,
        toolCall,
        toolResult: result,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, toolResultMsg])

      return result
    } catch {
      setError('Erro ao executar ação.')
      return { success: false, message: 'Erro' }
    }
  }, [conversationId])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, isStreaming, error, sendMessage, confirmAction, stop, conversationId }
}
