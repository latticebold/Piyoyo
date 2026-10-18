'use strict';

const { StringDecoder } = require('node:string_decoder');

const DEFAULT_OUTPUT_LIMIT_BYTES = 1024 * 1024;

function createBoundedOutput(limitBytes = DEFAULT_OUTPUT_LIMIT_BYTES) {
  const limit = Number.isSafeInteger(limitBytes) && limitBytes > 0
    ? limitBytes : DEFAULT_OUTPUT_LIMIT_BYTES;
  const streams = {
    stdout: { decoder: new StringDecoder('utf8'), text: '' },
    stderr: { decoder: new StringDecoder('utf8'), text: '' }
  };
  let retainedBytes = 0;
  let exceeded = false;
  let finished = false;

  return {
    get exceeded() { return exceeded; },
    get limitBytes() { return limit; },
    get retainedBytes() { return retainedBytes; },
    get reason() {
      return exceeded
        ? `標準出力と標準エラーの合計が ${limit} バイトの上限を超えたため、実行を停止し、残りの出力を省略しました。`
        : '';
    },
    write(streamName, chunk) {
      if (finished || exceeded) return false;
      const stream = streams[streamName];
      if (!stream) throw new TypeError(`Unknown output stream: ${streamName}`);
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = limit - retainedBytes;
      const accepted = Math.min(bytes.length, remaining);
      stream.text += stream.decoder.write(bytes.subarray(0, accepted));
      retainedBytes += accepted;
      if (bytes.length > remaining) {
        exceeded = true;
        return true;
      }
      return false;
    },
    finish() {
      if (!finished) {
        finished = true;
        for (const stream of Object.values(streams)) {
          // The cap (or stopping the child) may cut a valid UTF-8 character.
          // Keep complete characters only in that case; normal EOF still
          // reports genuinely incomplete source bytes through decoder.end().
          if (!exceeded) stream.text += stream.decoder.end();
        }
      }
      return { stdout: streams.stdout.text, stderr: streams.stderr.text };
    }
  };
}

module.exports = { DEFAULT_OUTPUT_LIMIT_BYTES, createBoundedOutput };
