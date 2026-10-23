// Text extraction from captured request / response payloads.
//
// request_logs has no content columns: the only place user input and
// model output live is request_body / response_body, which are filled
// when payload capture is on for the org (organizations.settings
// .capture_payloads) or the gateway (AURA_PAYLOAD_CAPTURE). The Harness
// trace timeline uses these helpers to show that content in its user /
// reasoning / assistant steps instead of a "content not stored" stub.

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Payloads over the capture limit are replaced by `{truncated: true, ...}`. */
export function isTruncatedPayload(body: unknown): boolean {
  return isObject(body) && body.truncated === true
}

/** Text of a content value: a string, or an array of parts with `text`. */
function contentText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts = content
    .map((part) => {
      if (typeof part === 'string') return part
      if (isObject(part) && typeof part.text === 'string') return part.text
      if (isObject(part) && (part.type === 'input_image' || part.type === 'image_url')) return '[image]'
      if (isObject(part) && part.type === 'input_file') return '[file]'
      return null
    })
    .filter((t): t is string => t != null && t !== '')
  return parts.length > 0 ? parts.join('\n') : null
}

/**
 * The user's input for this turn: the request's `input` when it is a
 * string, otherwise the last user message in the `input` items.
 */
export function extractUserText(requestBody: unknown): string | null {
  if (!isObject(requestBody) || isTruncatedPayload(requestBody)) return null
  const input = requestBody.input
  if (typeof input === 'string') return input || null
  if (!Array.isArray(input)) return null
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i]
    if (!isObject(item) || item.role !== 'user') continue
    if (item.type !== undefined && item.type !== 'message') continue
    const text = contentText(item.content)
    if (text) return text
  }
  return null
}

/** Assistant text: `output_text`, else the message items in `output`. */
export function extractAssistantText(responseBody: unknown): string | null {
  if (!isObject(responseBody) || isTruncatedPayload(responseBody)) return null
  if (typeof responseBody.output_text === 'string' && responseBody.output_text) {
    return responseBody.output_text
  }
  const output = responseBody.output
  if (!Array.isArray(output)) return null
  const texts = output
    .filter((item): item is Json => isObject(item) && item.type === 'message')
    .map((item) => contentText(item.content))
    .filter((t): t is string => t != null && t !== '')
  return texts.length > 0 ? texts.join('\n\n') : null
}

/** Reasoning text (summary, else content) from `reasoning` output items. */
export function extractReasoningText(responseBody: unknown): string | null {
  if (!isObject(responseBody) || isTruncatedPayload(responseBody)) return null
  const output = responseBody.output
  if (!Array.isArray(output)) return null
  const texts = output
    .filter((item): item is Json => isObject(item) && item.type === 'reasoning')
    .map((item) => contentText(item.summary) ?? contentText(item.content))
    .filter((t): t is string => t != null && t !== '')
  return texts.length > 0 ? texts.join('\n\n') : null
}
