import { A } from "@solidjs/router";
import { readdirSync, readFileSync } from "fs";
import { createSignal, For } from "solid-js";

interface RecipeLink {
  title: string;
  href: string;
}

async function loadRecipes(): Promise<RecipeLink[]> {
  "use server";

  const fileNames = readdirSync('./recipes')
  let titles = [];
  for (const fileName of fileNames) {
    const href = fileName.replace('.cook', '');
    const file = readFileSync('./recipes/' + fileName, 'utf-8');
    const lines = file.split('\n');
    const titleLine = lines.find((line) => line.startsWith('>> title:'))!;
    const title = titleLine.replace('>> title:', '').trim();
    titles.push({ title, href });
  }
  return titles;
}

export default function Home() {
  const [items, setItems] = createSignal<RecipeLink[]>([]);

  (async () => setItems(await loadRecipes()))();

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <h1 class='text-3xl mb-6'>Recipes</h1>
      <div class='flex flex-col'>
        <For each={items()}>
          {(item) => <A href={`/recipes/${item.href}`}>{item.title}</A>}
        </For>
      </div>
    </main>
  );
}
