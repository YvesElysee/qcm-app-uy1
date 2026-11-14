import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/**
 * Rendu lisible des réponses du tuteur IA.
 *
 * Les modèles produisent souvent du Markdown (`**gras**`, listes) et des
 * formules LaTeX délimitées par `\( ... \)` ou `\[ ... \]`. On convertit ces
 * délimiteurs vers la syntaxe comprise par remark-math, puis KaTeX affiche
 * les formules proprement : l'étudiant ne voit jamais les caractères bruts.
 */
function normalizeMath(text) {
  if (!text) return '';
  let out = String(text);

  // Formules centrées : \[ ... \] → $$ ... $$
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_match, expression) => {
    return `\n\n$$\n${String(expression).trim()}\n$$\n\n`;
  });

  // Formules en ligne : \( ... \) → $ ... $
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_match, expression) => {
    return `$${String(expression).trim()}$`;
  });

  // Délimiteurs orphelins (réponse tronquée par le fournisseur)
  out = out.replace(/\\\[/g, '\n$$\n').replace(/\\\]/g, '\n$$\n');
  out = out.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

  return out;
}

export default function AiMarkdown({ content }) {
  return (
    <div className="ai-markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        skipHtml
      >
        {normalizeMath(content)}
      </Markdown>
    </div>
  );
}
