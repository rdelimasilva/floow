import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeToolCall, ALLOWED_TOOLS } from '@/lib/cfo/chat-tools'
import { saveMessage } from '@/lib/cfo/chat-actions'
import type { ToolCall } from '@floow/core-finance'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.app_metadata?.org_ids?.[0]
  if (!orgId) {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const { conversationId, toolCall } = (await request.json()) as {
    conversationId?: string
    toolCall: ToolCall
  }

  if (!ALLOWED_TOOLS.includes(toolCall.name as any)) {
    return NextResponse.json({ error: 'Tool not allowed' }, { status: 400 })
  }

  const result = await executeToolCall(toolCall, orgId)

  if (conversationId) {
    await saveMessage(conversationId, 'tool_result', result.message, toolCall, result)
  }

  return NextResponse.json(result)
}
