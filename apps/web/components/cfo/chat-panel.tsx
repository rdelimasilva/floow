'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Square } from 'lucide-react'
import { useChat } from '@/hooks/use-chat'
import { ChatMessage } from './chat-message'
import type { ToolCall } from '@floow/core-finance'

interface ChatPanelProps {
  insightId?: string
  className?: string
}

export function ChatPanel({ insightId, className }: ChatPanelProps) {
  const { messages, isStreaming, error, sendMessage, confirmAction, stop } = useChat({ insightId })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  function handleConfirmAction(toolCall: ToolCall) {
    confirmAction(toolCall)
  }

  return (
    <div className={className}>
      <div ref={scrollRef} className="space-y-4 overflow-y-auto max-h-[400px] mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Pergunte qualquer coisa sobre suas finanças.
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
            onConfirmAction={handleConfirmAction}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-destructive mb-2">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua pergunta..."
          disabled={isStreaming}
          className="flex-1"
        />
        {isStreaming ? (
          <Button type="button" size="icon" variant="outline" onClick={stop} title="Parar resposta" aria-label="Parar resposta">
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} title="Enviar" aria-label="Enviar">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
