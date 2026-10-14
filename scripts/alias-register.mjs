// Register hook do Node para resolver imports '@/x' → <raiz-do-projeto>/x.
// Permite importar módulos do backend (lib/nexos/...) em scripts de teste
// fora do bundler do Next.js.
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDir, '..');

export function registerAlias() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      // Alias do projeto: '@/x' → <raiz>/x
      if (specifier.startsWith('@/')) {
        const base = path.join(projectRoot, specifier.slice(2));
        const candidatos = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
        for (const c of candidatos) {
          if (fs.existsSync(c)) return nextResolve(pathToFileURL(c).href, context);
        }
        return nextResolve(specifier, context);
      }
      // Imports relativos sem extensão (o bundler do Next resolve; o Node puro não)
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && context?.parentURL?.startsWith('file:')) {
        const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
        const candidatos = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
        for (const c of candidatos) {
          if (fs.existsSync(c)) return nextResolve(pathToFileURL(c).href, context);
        }
      }
      return nextResolve(specifier, context);
    },
  });
}
