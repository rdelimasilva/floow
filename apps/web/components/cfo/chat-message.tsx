'use client'

import { cn } from '@/lib/utils'
import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMessageType, ToolCall } from '@floow/core-finance'
import { ToolCallCard } from './tool-call-card'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
  onConfirmAction?: (toolCall: ToolCall) => void
}

export function ChatMessage({ message, isStreaming, onConfirmAction }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isToolResult = message.role === 'tool_result'

  if (isToolResult) {
    const success = message.toolResult?.success
    return (
      <div className="flex justify-center">
        <div className={cn(
          'rounded-lg px-3 py-2 text-xs',
          success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
        )}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('max-w-[80%] space-y-2', isUser ? 'text-right' : 'text-left')}>
        <div className={cn(
          'inline-block rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}>
          {message.content || (isStreaming ? '...' : '')}
          {isStreaming && <span className="animate-pulse">|</span>}
        </div>

        {message.toolCall && onConfirmAction && (
          <ToolCallCard toolCall={message.toolCall} onConfirm={onConfirmAction} />
        )}
      </div>
    </div>
  )
}
