import { NextResponse } from 'next/server'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { executeToolCall, ALLOWED_TOOLS } from '@/lib/cfo/chat-tools'
import { saveMessage } from '@/lib/cfo/chat-actions'
import { getDb, orgMembers } from '@floow/db'
import { eq, asc } from 'drizzle-orm'
import type { ToolCall } from '@floow/core-finance'

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let orgId: string
  try {
    orgId = await getOrgId()
  } catch {
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
