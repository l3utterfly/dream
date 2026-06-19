declare module "d3-cloud" {
  export interface CloudWord {
    text: string;
    size: number;
    value?: number;
    x?: number;
    y?: number;
    rotate?: number;
  }

  export interface CloudLayout<Word extends CloudWord = CloudWord> {
    start(): this;
    stop(): this;
    words(): Word[];
    words(words: Word[]): this;
    size(): [number, number];
    size(size: [number, number]): this;
    font(font: string | ((word: Word) => string)): this;
    fontWeight(weight: string | number | ((word: Word) => string | number)): this;
    fontSize(size: number | ((word: Word) => number)): this;
    padding(padding: number | ((word: Word) => number)): this;
    rotate(rotate: number | ((word: Word) => number)): this;
    random(random: () => number): this;
    on(type: "word", listener: (word: Word) => void): this;
    on(type: "end", listener: (words: Word[]) => void): this;
  }

  export default function cloud<Word extends CloudWord = CloudWord>(): CloudLayout<Word>;
}

declare module "stopword" {
  export const eng: string[];
  export function removeStopwords(tokens: string[], stopwords?: string[]): string[];
}
