import { useParams } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { readFileSync } from "fs";
import Recipe from "~/cooklang/Recipe";
import { Cookware, Ingredient, Metadata, ShoppingList, Step, Timer, Text, ParsedQuantity } from "~/cooklang";

export interface RecipeProps {
    ingredients: Array<Ingredient>;
    cookwares: Array<Cookware>;
    metadata: Metadata;
    steps: Array<Step>;
    shoppingList: ShoppingList;
}

export type StepPart = Ingredient | Cookware | Timer | Text;

const [checkedSteps, setCheckedSteps] = createSignal(new Set<number>());
const [scale, setScale] = createSignal(1);

function startScale(event: MouseEvent) {
    let startX = event.clientX;
    let startScale = scale();

    function handleMouseMove(event: MouseEvent) {
        setScale(startScale + (event.clientX - startX) / 100);
    }

    document.addEventListener('mousemove', handleMouseMove);

    document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', handleMouseMove);
    });
}

const acceptableDenominators = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const maxDistanceToNumerator = 0.01;

function scaleQuantity(quantity: number | string | undefined) {
    if (typeof quantity === 'string') {
        return quantity;
    }

    if (isNaN(Number(quantity))) {
        return quantity;
    }

    return Number(quantity) * scale();
}

function roundFixed(f: number) {
    if (!f || Number.isNaN(f)) return f;

    const fixed = f.toFixed(1);
    if (fixed.endsWith('.0')) {
        return fixed.slice(0, -2);
    }
    return fixed;
}

function numberToFractionString(n: number | string | undefined, isFraction: boolean) {
    if (typeof n === 'undefined') {
        return '';
    }

    if (typeof n === 'string') {
        return n;
    }

    if (!isFraction) {
        return roundFixed(n);
    }

    const negative = (n < 0);
    if (negative) n = -n;

    const wholePart = Math.floor(n);
    n -= wholePart;

    const denom = acceptableDenominators.find(d =>
        Math.abs(d * n - Math.round(d * n)) <= maxDistanceToNumerator
    );
    if (typeof denom === 'undefined') {
        return roundFixed(n + wholePart)
    }
    const numer = Math.round(denom * n);

    if (denom === 1) {
        return "" + (wholePart + numer) * (negative ? -1 : 1);
    }

    return (negative ? "-" : "") +
        (wholePart ? wholePart + " " : "") +
        numer + "/" + denom;

}

async function readRecipe(params: any): Promise<RecipeProps> {
    "use server";

    const file = readFileSync('./recipes/' + params.id + '.cook', 'utf-8');
    const recipe = new Recipe(file);

    return {
        ingredients: recipe.ingredients,
        cookwares: recipe.cookwares,
        metadata: recipe.metadata,
        steps: recipe.steps,
        shoppingList: recipe.shoppingList,
    };
}

function IngredientComponent(props: { ingredient: Ingredient }) {
    const [checked, setChecked] = createSignal(false);

    function isChecked() {
        return checked() || checkedSteps().has(props.ingredient.step);
    }

    function checkedOpacity() { return isChecked() ? 'text-opacity-30' : '' };

    return (
        <div class="flex flex-row my-1">
            <input type="checkbox" checked={isChecked()} onChange={() => setChecked(!checked())} class="appearance-none mr-1 h-6 w-6 border border-gray-400 rounded-md shadow checked:bg-blue-300 checked:border-0" />
            <div class={`mr-1 text-black ${checkedOpacity()}`}>{props.ingredient.name}:</div>
            <div class={`italic text-slate-500 ${checkedOpacity()} select-none`} onMouseDown={startScale}>{numberToFractionString(scaleQuantity(props.ingredient.quantity.quantity), props.ingredient.quantity.wasFraction)} {props.ingredient.units}</div>
        </div>
    );
}

function Ingredients(props: { ingredients: Array<Ingredient> }) {
    return (
        <div class="flex flex-col ml-6 mt-8">
            <span class="text-3xl mb-2">Ingredients</span>
            <For each={props.ingredients}>
                {(ingredient) => <IngredientComponent ingredient={ingredient} />}
            </For>
        </div>
    );
}

function StepPart(props: { part: StepPart }) {
    switch (props.part.type) {
        case 'ingredient':
            return (
                <div class="has-tooltip bg-orange-300 bg-opacity-20 px-1 rounded-md text-orange-700 text-nowrap">
                    {props.part.name}
                    <span class="tooltip rounded shadow-lg p-1 text-red-600">{numberToFractionString(scaleQuantity(props.part.quantity.quantity), props.part.quantity.wasFraction)} {props.part.units}</span>
                </div>
            );
        case 'cookware':
            return <div>{props.part.name}</div>;
        case 'timer':
            return <div>{props.part.name}</div>;
        case 'text':
            const isPunctuation = props.part.value.match(/[.,!?]/);
            const classes = isPunctuation ? '' : 'mx-1';
            return <div class={classes}>{props.part.value}</div>;
    }
}

function StepComponent(props: { step: Step }) {
    const [checked, setChecked] = createSignal(false);

    function checkStep() {
        setChecked(!checked());

        if (checked()) {
            for (const ingredient of props.step) {
                if (ingredient.type === 'ingredient' && !checkedSteps().has(ingredient.step)) {
                    // console.log('adding ' + ingredient.step);
                    checkedSteps().add(ingredient.step);
                }
            }
        } else {
            for (const ingredient of props.step) {
                if (ingredient.type === 'ingredient') {
                    while (checkedSteps().has(ingredient.step)) {
                        // console.log('removing ' + ingredient.step);
                        checkedSteps().delete(ingredient.step);
                    }
                }
            }
        }

        setCheckedSteps(new Set(checkedSteps()));
    }

    function checkedOpacity() { return checked() ? 'opacity-35' : '' };

    return (
        <div class={`flex flex-row flex-wrap bg-gray-200 rounded-lg shadow-lg px-4 py-6 my-3 ${checkedOpacity()}`}>
            <input type="checkbox" checked={checked()} onChange={() => checkStep()} class="appearance-none mr-1 h-6 w-6 border border-gray-400 bg-white rounded-md shadow checked:bg-blue-300 checked:border-0" />
            <For each={props.step}>
                {(stepPart) => <StepPart part={stepPart}></StepPart>}
            </For>
        </div>
    );
}

function Method(props: { method: Array<Step> }) {
    return (
        <div class="flex flex-col ml-6 mt-8">
            <span class="text-3xl">Method</span>
            <For each={props.method}>
                {(step) => <StepComponent step={step} />}
            </For>
        </div>
    );
}

function Scale() {
    return (
        <div class="flex flex-row text-xl ml-6 mb-3">
            <span class="mr-2">Scale:</span>
            <span class="select-none" onMouseDown={startScale}>{roundFixed(scale())}</span>
        </div>
    );
}

enum Sections {
    Ingredients,
    Method,
}

export default function RecipeComponent() {
    const [recipe, setRecipe] = createSignal<RecipeProps | undefined>(undefined);

    const [selected, setSelected] = createSignal<Sections>(Sections.Ingredients);

    function borderFor(section: Sections) {
        return selected() === section ? 'border-b-2 border-blue-500' : 'border-b-2';
    }

    const params = useParams();
    (async () => setRecipe(await readRecipe(params)))();

    return (
        <main class="p-4">
            <h1 class="text-5xl mt-6 ml-6 text-gray-700 font-thin uppercase my-8">{recipe()?.metadata?.title}</h1>
            <Scale />
            <div class="flex flex-row ml-4 mb-8 select-none">
                <div class={`p-2 border-b ${borderFor(Sections.Ingredients)}`} onClick={() => setSelected(Sections.Ingredients)}>Ingredients</div>
                <div class={`p-2 border-b ${borderFor(Sections.Method)}`} onClick={() => setSelected(Sections.Method)}>Method</div>
            </div>
            <Show when={selected() === Sections.Ingredients}>
                <Ingredients ingredients={recipe()?.ingredients || []} />
            </Show>
            <Show when={selected() === Sections.Method}>
                <Method method={recipe()?.steps || []} />
            </Show>
        </main>
    );

    // return (
    //     <main class="p-4">
    //         <h1 class="text-5xl mt-6 ml-6 text-gray-700 font-thin uppercase my-8">{recipe()?.metadata?.title}</h1>
    //         <Scale />
    //         <Ingredients ingredients={recipe()?.ingredients || []} />
    //         <Method method={recipe()?.steps || []} />
    //     </main>
    // );
}