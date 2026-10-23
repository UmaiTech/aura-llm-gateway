//! Helpers shared by the provider stream transformers.
//!
//! Every provider streams SSE bytes from `reqwest` and parses them line by
//! line. Network chunks are cut at arbitrary byte offsets, so a chunk can
//! end in the middle of a multi-byte UTF-8 character. Decoding each chunk
//! on its own with `String::from_utf8` fails in that case, and the naive
//! `if let Ok(...)` around it silently dropped the whole chunk: a few
//! words vanished mid-sentence, and when the dropped chunk carried the
//! finish reason the stream never completed. [`push_utf8`] keeps the
//! trailing incomplete bytes until the next chunk arrives.

/// Append `bytes` to `buffer`, carrying an incomplete trailing UTF-8
/// sequence over in `pending` until the rest of it arrives.
///
/// Bytes that can never form a valid character (an invalid sequence in
/// the middle of a chunk) are replaced with U+FFFD rather than dropped,
/// so a corrupt byte costs one character instead of a chunk.
pub fn push_utf8(buffer: &mut String, pending: &mut Vec<u8>, bytes: &[u8]) {
    let input: std::borrow::Cow<'_, [u8]> = if pending.is_empty() {
        std::borrow::Cow::Borrowed(bytes)
    } else {
        let mut joined = std::mem::take(pending);
        joined.extend_from_slice(bytes);
        std::borrow::Cow::Owned(joined)
    };
    let mut rest: &[u8] = &input;
    loop {
        match std::str::from_utf8(rest) {
            Ok(s) => {
                buffer.push_str(s);
                return;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                // Safe: `valid_up_to` guarantees this prefix is UTF-8.
                buffer.push_str(std::str::from_utf8(&rest[..valid]).unwrap_or(""));
                match e.error_len() {
                    // Incomplete sequence at the end: wait for more bytes.
                    None => {
                        pending.extend_from_slice(&rest[valid..]);
                        return;
                    }
                    // Genuinely invalid bytes: replace and keep going.
                    Some(bad) => {
                        buffer.push('\u{FFFD}');
                        rest = &rest[valid + bad..];
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_chunks_pass_through() {
        let mut buf = String::new();
        let mut pending = Vec::new();
        push_utf8(&mut buf, &mut pending, b"data: {\"a\":1}\n");
        assert_eq!(buf, "data: {\"a\":1}\n");
        assert!(pending.is_empty());
    }

    #[test]
    fn a_character_split_across_chunks_is_reassembled() {
        // "autonomy — dialogue": the em dash is three bytes.
        let text = "autonomy \u{2014} dialogue";
        let bytes = text.as_bytes();
        let cut = bytes.iter().position(|b| *b == 0xE2).unwrap() + 1;
        let mut buf = String::new();
        let mut pending = Vec::new();
        push_utf8(&mut buf, &mut pending, &bytes[..cut]);
        assert_eq!(buf, "autonomy ");
        assert_eq!(pending, &bytes[cut - 1..cut]);
        push_utf8(&mut buf, &mut pending, &bytes[cut..]);
        assert_eq!(buf, text);
        assert!(pending.is_empty());
    }

    #[test]
    fn split_at_every_offset_reproduces_the_text() {
        let text = "caf\u{e9} \u{1F600} \u{2014} \u{4e2d}\u{6587}\n";
        let bytes = text.as_bytes();
        for cut in 0..=bytes.len() {
            let mut buf = String::new();
            let mut pending = Vec::new();
            push_utf8(&mut buf, &mut pending, &bytes[..cut]);
            push_utf8(&mut buf, &mut pending, &bytes[cut..]);
            assert_eq!(buf, text, "cut at {cut}");
            assert!(pending.is_empty(), "cut at {cut}");
        }
    }

    #[test]
    fn invalid_bytes_become_replacement_characters() {
        let mut buf = String::new();
        let mut pending = Vec::new();
        push_utf8(&mut buf, &mut pending, b"ok\xFFstill ok");
        assert_eq!(buf, "ok\u{FFFD}still ok");
        assert!(pending.is_empty());
    }
}
