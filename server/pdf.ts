import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';

/**
 * PDF a partir de HTML, impresso pelo Edge/Chrome instalado no servidor em modo headless.
 * É o mesmo HTML do botão "Imprimir" (src/utils/imprimirDocumento.ts): o PDF enviado
 * sai igual ao que o usuário imprime. Caminho do navegador: NAVEGADOR_PDF no .env, ou o
 * primeiro encontrado nos locais padrão.
 */

const CANDIDATOS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

function navegador(): string {
  const escolhido = process.env.NAVEGADOR_PDF || CANDIDATOS.find((c) => existsSync(c));
  if (!escolhido) throw new Error('Gerar PDF: nenhum Edge/Chrome encontrado no servidor. Informe NAVEGADOR_PDF no .env.');
  return escolhido;
}

export async function gerarPdf(html: string): Promise<Buffer> {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'crmweb-pdf-'));
  try {
    const entrada = path.join(pasta, 'doc.html');
    const saida = path.join(pasta, 'doc.pdf');
    // O script de impressão da janela não tem uso aqui
    await fs.writeFile(entrada, html.replace(/<script>[\s\S]*?<\/script>/g, ''), 'utf8');
    await promisify(execFile)(
      navegador(),
      [
        '--headless',
        '--disable-gpu',
        '--no-pdf-header-footer',
        // Perfil próprio: sem ele o Edge reaproveita a sessão aberta do usuário e não imprime
        `--user-data-dir=${path.join(pasta, 'perfil')}`,
        `--print-to-pdf=${saida}`,
        `file:///${entrada.replace(/\\/g, '/')}`,
      ],
      { timeout: 60_000 },
    );
    return await fs.readFile(saida);
  } catch (err: any) {
    throw new Error(`Não foi possível gerar o PDF: ${err.message}`);
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
