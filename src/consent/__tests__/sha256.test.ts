import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../ai-improvement.js';

// Known-answer tests. Expected values are FIPS 180-4 examples or were produced
// independently with coreutils `sha256sum` (printf '%s' "<text>" | sha256sum).
describe('sha256Hex known answers', () => {
  const cases: Array<[string, string, string]> = [
    ['empty string', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['FIPS "abc"', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'FIPS 448-bit message (two blocks)',
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['55 bytes (last single-block length)', 'x'.repeat(55), 'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072'],
    ['56 bytes (forces a second block)', 'x'.repeat(56), '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e'],
    ['64 bytes (exact block)', 'x'.repeat(64), '7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c'],
    [
      'multi-byte UTF-8 (2, 3 and 4-byte characters)',
      'año ü € 😀',
      '2b18df55edbc363c37bf9856412fabae8cefcc20329c71b4f93b5683a7b520a1',
    ],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(sha256Hex(input)).toBe(expected);
    });
  }

  it('FIPS one million "a" (many blocks)', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});
