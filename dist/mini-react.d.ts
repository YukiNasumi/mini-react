declare const TEXT_ELEMENT = "TEXT_ELEMENT";
type Key = string | number | null;
type Component<P = any> = (props: P) => ElementNode | null;
type ElementType = string | typeof TEXT_ELEMENT | Component<any>;
type ChildValue = ElementNode | string | number | boolean | null | undefined;
type Child = ChildValue | ChildValue[];
type StateUpdater<T> = T | ((prev: T) => T);
export type PropsConfig = Record<string, unknown> & {
    key?: Key;
};
export type ElementNode = {
    type: ElementType;
    key: Key;
    props: PropsConfig & {
        children: ElementNode[];
        nodeValue?: string;
    };
};
export declare function createElement(type: ElementType, config?: PropsConfig | null, ...childrenArgs: Child[]): ElementNode;
export declare function render(element: ElementNode, container: Element): void;
export declare function useState<T>(initialValue: T | (() => T)): [T, (nextValue: StateUpdater<T>) => void];
export {};
