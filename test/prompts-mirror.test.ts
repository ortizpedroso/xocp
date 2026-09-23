import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const V1_DIR = 'packages/opencode/src/agent/prompt';
const V2_DIR = 'packages/core/src/plugin';

function md5Hash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

describe('Prompts Mirror Test', () => {
  it('deve ter todos os prompts de V1 espelhados em V2 com hash idêntico', () => {
    const v1Files = readdirSync(V1_DIR).filter(f => f.endsWith('.txt'));

    for (const file of v1Files) {
      const v1Path = join(V1_DIR, file);
      const v2Path = join(V2_DIR, file);

      expect(existsSync(v1Path)).toBe(true);
      expect(
        existsSync(v2Path),
        `Prompt ${file} não existe em V2`,
      ).toBe(true);

      const v1Content = readFileSync(v1Path, 'utf-8');
      const v2Content = readFileSync(v2Path, 'utf-8');

      const v1Hash = md5Hash(v1Content);
      const v2Hash = md5Hash(v2Content);

      // Hash MD5 divergente para ${file}: V1=${v1Hash}, V2=${v2Hash}
      expect(v1Hash).toBe(v2Hash);
    }
  });

  it('deve ter o mesmo número de prompts em V1 e V2', () => {
    const v1Files = readdirSync(V1_DIR).filter(f => f.endsWith('.txt'));
    const v2Files = readdirSync(V2_DIR).filter(f => f.endsWith('.txt'));

    expect(v1Files.length).toBe(
      v2Files.length,
      `Contagem divergente: V1=${v1Files.length}, V2=${v2Files.length}`,
    );
  });
});
