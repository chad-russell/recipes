import { comment, blockComment, shoppingList as shoppingListRegex, tokens } from './tokens';
import { type Ingredient, type Cookware, type Step, type Metadata, type Item, type ShoppingList, type ParsedQuantity } from './cooklang';

/**
 * @property defaultCookwareAmount The default value to pass if there is no cookware amount. By default the amount is 1
 * @property defaultIngredientAmount The default value to pass if there is no ingredient amount. By default the amount is "some"
 * @property includeStepNumber Whether or not to include the step number in ingredient and cookware nodes
 *
 */
export interface ParserOptions {
    defaultCookwareAmount?: string | number;
    defaultIngredientAmount?: string | number;
    includeStepNumber?: boolean;
}

export interface ParseResult {
    ingredients: Array<Ingredient>;
    cookwares: Array<Cookware>;
    metadata: Metadata;
    steps: Array<Step>;
    shoppingList: ShoppingList;
}

export default class Parser {
    defaultCookwareAmount: ParsedQuantity;
    defaultIngredientAmount: ParsedQuantity;
    includeStepNumber: boolean;
    defaultUnits = '';

    /**
     * Creates a new parser with the supplied options
     *
     * @param options The parser's options
     */
    constructor(options?: ParserOptions) {
        this.defaultCookwareAmount = {
            quantity: options?.defaultCookwareAmount ?? 1,
            wasFraction: false,
        }
        this.defaultIngredientAmount = {
            quantity: options?.defaultIngredientAmount ?? 'some',
            wasFraction: false,
        };
        this.includeStepNumber = options?.includeStepNumber ?? false;
    }

    /**
     * Parses a Cooklang string and returns any metadata, steps, or shopping lists
     *
     * @param source A Cooklang recipe
     * @returns The extracted ingredients, cookwares, metadata, steps, and shopping lists
     *
     * @see {@link https://cooklang.org/docs/spec/#the-cook-recipe-specification|Cooklang Recipe}
     */
    parse(source: string): ParseResult {
        const ingredients: Array<Ingredient> = [];
        const cookwares: Array<Cookware> = [];
        const metadata: Metadata = {};
        const steps: Array<Step> = [];
        const shoppingList: ShoppingList = {};

        // Comments
        source = source.replace(comment, '').replace(blockComment, ' ');

        // Parse shopping lists
        for (let match of source.matchAll(shoppingListRegex)) {
            const groups = match.groups;
            if (!groups) continue;

            shoppingList[groups.name] = parseShoppingListCategory(
                groups.items || ''
            );

            // Remove it from the source
            source = source.substring(0, match.index || 0);
            +source.substring((match.index || 0) + match[0].length);
        }

        const lines = source.split(/\r?\n/).filter((l) => l.trim().length > 0);

        let stepNumber = 0;
        stepLoop: for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const step: Step = [];

            let pos = 0;
            for (let match of line.matchAll(tokens)) {
                const groups = match.groups;
                if (!groups) continue;

                // metadata
                if (groups.key && groups.value) {
                    metadata[groups.key.trim()] = groups.value.trim();

                    continue stepLoop;
                }

                // text
                if (pos < (match.index || 0)) {
                    step.push({
                        type: 'text',
                        value: line.substring(pos, match.index),
                    });
                }

                // single word ingredient
                if (groups.sIngredientName) {
                    const ingredient: Ingredient = {
                        type: 'ingredient',
                        step: stepNumber,
                        name: groups.sIngredientName,
                        quantity: this.defaultIngredientAmount,
                        quantityIsFraction: false,
                        units: this.defaultUnits,
                    };

                    ingredients.push(ingredient);
                    step.push(ingredient);
                }

                // multiword ingredient
                if (groups.mIngredientName) {
                    const quantity = parseQuantity(groups.mIngredientQuantity);
                    const ingredient: Ingredient = {
                        type: 'ingredient',
                        step: stepNumber,
                        name: groups.mIngredientName,
                        quantity: quantity ?? this.defaultIngredientAmount,
                        quantityIsFraction: quantity?.wasFraction ?? false,
                        units: parseUnits(groups.mIngredientUnits) ?? this.defaultUnits,
                    };

                    ingredients.push(ingredient);
                    step.push(ingredient);
                }

                // single word cookware
                if (groups.sCookwareName) {
                    const cookware: Cookware = {
                        type: 'cookware',
                        step: stepNumber,
                        name: groups.sCookwareName,
                        quantity: this.defaultCookwareAmount,
                    };

                    cookwares.push(cookware);
                    step.push(cookware);
                }

                // multiword cookware
                if (groups.mCookwareName) {
                    const cookware: Cookware = {
                        type: 'cookware',
                        step: stepNumber,
                        name: groups.mCookwareName,
                        quantity:
                            parseQuantity(groups.mCookwareQuantity) ??
                            this.defaultCookwareAmount,
                    };

                    cookwares.push(cookware);
                    step.push(cookware);
                }

                // timer
                if (groups.timerQuantity) {
                    step.push({
                        type: 'timer',
                        name: groups.timerName,
                        quantity: parseQuantity(groups.timerQuantity) ?? 0,
                        units: parseUnits(groups.timerUnits) ?? this.defaultUnits,
                    });
                }

                pos = (match.index || 0) + match[0].length;
            }

            // If the entire line hasn't been parsed yet
            if (pos < line.length) {
                // Add the rest as a text item
                step.push({
                    type: 'text',
                    value: line.substring(pos),
                });
            }

            if (step.length > 0) {
                steps.push(step);
                stepNumber++;
            }
        }

        return { ingredients, cookwares, metadata, steps, shoppingList };
    }
}


function parseMixedFraction(mixedFraction: string) {
    const [wholeStr, fractionalStr] = mixedFraction.split(' ');
    const whole = Number(wholeStr);
    const fractional = parseNonMixedFraction(fractionalStr);
    return whole + fractional;
}

function parseNonMixedFraction(fraction: string) {
    const [numerator, denominator] = fraction.split('/').map(Number);
    return numerator / denominator;
}

function parseQuantity(quantity?: string): ParsedQuantity {
    if (!quantity || quantity.trim() === '') {
        return { quantity: undefined, wasFraction: false };
    }

    // If every character is a number or a decimal point or a space or a slash or a percent, then it's a number
    const isNumber = /^[0-9.\/\s%]+$/.test(quantity);
    if (!isNumber) {
        return { quantity: quantity.trim(), wasFraction: false };
    }

    quantity = quantity.trim();

    if (quantity.includes(' ')) {
        return { quantity: parseMixedFraction(quantity), wasFraction: true };
    }

    if (quantity.includes('/')) {
        return { quantity: parseNonMixedFraction(quantity), wasFraction: true };
    }

    const num = Number(quantity);
    if (!isNaN(num)) {
        return { quantity: num, wasFraction: false };
    }

    return { quantity: quantity.trim(), wasFraction: false };
}

function parseUnits(units?: string): string | undefined {
    if (!units || units.trim() === "") {
        return undefined;
    }

    return units.trim();
}

function parseShoppingListCategory(items: string): Array<Item> {
    const list = [];

    for (let item of items.split('\n')) {
        item = item.trim();

        if (item == '') continue;

        const [name, synonym] = item.split('|');

        list.push({
            name: name.trim(),
            synonym: synonym?.trim() || '',
        })
    }

    return list;
}
