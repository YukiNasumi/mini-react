const TEXT_ELEMENT = "TEXT_ELEMENT";

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

type Hook<T = unknown> = {
  state: T;
};

type BaseInstance = {
  element: ElementNode;
  dom: Node | null;
  rootContainer: Element;
};

type TextInstance = BaseInstance & {
  dom: Text;
};

type DomInstance = BaseInstance & {
  dom: HTMLElement;
  childInstances: Instance[];
};

type FunctionInstance = BaseInstance & {
  hooks: Hook[];
  hookIndex: number;
  childInstance: Instance | null;
};

type Instance = TextInstance | DomInstance | FunctionInstance;

type RootRecord = {
  element: ElementNode | null;
  instance: Instance | null;
};

function createTextElement(value: string | number): ElementNode {
  return {
    type: TEXT_ELEMENT,
    key: null,
    props: {
      nodeValue: String(value),
      children: [],
    },
  };
}

export function createElement(
  type: ElementType,
  config: PropsConfig | null = null,
  ...childrenArgs: Child[]
): ElementNode {
  const props: PropsConfig & { children: ElementNode[] } = { ...(config || {}), children: [] };
  const key = props.key ?? null;
  delete props.key;

  const flatChildren = childrenArgs.flat() as ChildValue[];
  props.children = flatChildren
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true)
    .map((child) => (typeof child === "object" ? child : createTextElement(child)));

  return { type, key, props };
}

const roots = new Map<Element, RootRecord>();
let currentFunctionInstance: FunctionInstance | null = null;

export function render(element: ElementNode, container: Element): void {
  const root = roots.get(container) || { element: null, instance: null };
  const nextInstance = reconcile(container, root.instance, element, container);
  roots.set(container, { element, instance: nextInstance });
}

function rerender(container: Element): void {
  const root = roots.get(container);
  if (!root || !root.element) return;
  const nextInstance = reconcile(container, root.instance, root.element, container);
  roots.set(container, { ...root, instance: nextInstance });
}

export function useState<T>(initialValue: T | (() => T)): [T, (nextValue: StateUpdater<T>) => void] {
  if (!currentFunctionInstance) {
    throw new Error("useState can only be called inside a function component.");
  }

  const hooks = currentFunctionInstance.hooks as Hook<T>[];
  const idx = currentFunctionInstance.hookIndex++;

  if (hooks.length <= idx) {
    hooks.push({
      state: typeof initialValue === "function" ? (initialValue as () => T)() : initialValue,
    });
  }

  const hook = hooks[idx];
  const container = currentFunctionInstance.rootContainer;

  function setState(nextValue: StateUpdater<T>): void {
    const prev = hook.state;
    const next = typeof nextValue === "function" ? (nextValue as (value: T) => T)(prev) : nextValue;
    if (Object.is(prev, next)) return;
    hook.state = next;
    rerender(container);
  }

  return [hook.state, setState];
}

function reconcile(
  parentDom: Node,
  instance: Instance | null,
  element: ElementNode | null,
  rootContainer: Element
): Instance | null {
  if (instance == null) {
    if (element == null) return null;
    const newInstance = instantiate(element, rootContainer);
    if (newInstance?.dom) {
      parentDom.appendChild(newInstance.dom);
    }
    return newInstance;
  }

  if (element == null) {
    if (instance.dom) {
      parentDom.removeChild(instance.dom);
    }
    return null;
  }

  if (instance.element.type !== element.type) {
    const newInstance = instantiate(element, rootContainer);
    if (instance.dom && newInstance?.dom) {
      parentDom.replaceChild(newInstance.dom, instance.dom);
    } else if (instance.dom && !newInstance?.dom) {
      parentDom.removeChild(instance.dom);
    } else if (!instance.dom && newInstance?.dom) {
      parentDom.appendChild(newInstance.dom);
    }
    return newInstance;
  }

  if (typeof element.type === "function") {
    const functionInstance = instance as FunctionInstance;
    functionInstance.element = element;
    functionInstance.rootContainer = rootContainer;
    functionInstance.hookIndex = 0;

    const prevInstance = currentFunctionInstance;
    currentFunctionInstance = functionInstance;
    const childElement = element.type(element.props);
    currentFunctionInstance = prevInstance;

    const childInstance = reconcile(parentDom, functionInstance.childInstance, childElement, rootContainer);

    functionInstance.dom = childInstance ? childInstance.dom : null;
    functionInstance.childInstance = childInstance;
    return functionInstance;
  }

  if (element.type === TEXT_ELEMENT) {
    const textInstance = instance as TextInstance;
    if (textInstance.dom.nodeValue !== element.props.nodeValue) {
      textInstance.dom.nodeValue = element.props.nodeValue ?? "";
    }
    textInstance.element = element;
    return textInstance;
  }

  const domInstance = instance as DomInstance;
  updateDomProperties(domInstance.dom, domInstance.element.props, element.props);
  domInstance.childInstances = reconcileChildrenByKey(domInstance, element, rootContainer);
  domInstance.element = element;
  return domInstance;
}

function reconcileChildrenByKey(instance: DomInstance, element: ElementNode, rootContainer: Element): Instance[] {
  const parentDom = instance.dom;
  const oldChildInstances = instance.childInstances;
  const newChildElements = element.props.children || [];

  const oldKeyed = new Map<Key, Instance>();
  const oldUnkeyed: Instance[] = [];

  for (const oldInstance of oldChildInstances) {
    const oldKey = oldInstance.element.key;
    if (oldKey !== null && oldKey !== undefined) {
      oldKeyed.set(oldKey, oldInstance);
    } else {
      oldUnkeyed.push(oldInstance);
    }
  }

  let unkeyedIndex = 0;
  const nextChildInstances: Instance[] = [];

  for (const childElement of newChildElements) {
    const key = childElement.key;
    let matchedOld: Instance | null = null;

    if (key !== null && key !== undefined) {
      matchedOld = oldKeyed.get(key) || null;
      if (matchedOld) oldKeyed.delete(key);
    } else {
      matchedOld = oldUnkeyed[unkeyedIndex] || null;
      unkeyedIndex += 1;
    }

    const nextChild = reconcile(parentDom, matchedOld, childElement, rootContainer);
    if (nextChild) nextChildInstances.push(nextChild);
  }

  for (const leftover of oldKeyed.values()) {
    reconcile(parentDom, leftover, null, rootContainer);
  }

  for (let i = unkeyedIndex; i < oldUnkeyed.length; i += 1) {
    reconcile(parentDom, oldUnkeyed[i], null, rootContainer);
  }

  // Keep DOM order aligned with virtual children order.
  for (let i = 0; i < nextChildInstances.length; i += 1) {
    const childDom = nextChildInstances[i].dom;
    if (!childDom) continue;
    const domAtIndex = parentDom.childNodes[i] || null;
    if (childDom !== domAtIndex) {
      parentDom.insertBefore(childDom, domAtIndex);
    }
  }

  return nextChildInstances;
}

function instantiate(element: ElementNode | null, rootContainer: Element): Instance | null {
  if (element == null) return null;

  const { type, props } = element;

  if (typeof type === "function") {
    const instance: FunctionInstance = {
      element,
      dom: null,
      childInstance: null,
      hooks: [],
      hookIndex: 0,
      rootContainer,
    };

    const prevInstance = currentFunctionInstance;
    currentFunctionInstance = instance;
    const childElement = type(props);
    currentFunctionInstance = prevInstance;

    const childInstance = instantiate(childElement, rootContainer);
    instance.dom = childInstance ? childInstance.dom : null;
    instance.childInstance = childInstance;
    return instance;
  }

  if (type === TEXT_ELEMENT) {
    const dom = document.createTextNode(props.nodeValue ?? "");
    return {
      element,
      dom,
      rootContainer,
    };
  }

  const dom = document.createElement(type);
  updateDomProperties(dom, {}, props);

  const childInstances = props.children
    .map((childElement) => instantiate(childElement, rootContainer))
    .filter((childInstance): childInstance is Instance => Boolean(childInstance));

  for (const childInstance of childInstances) {
    if (childInstance.dom) dom.appendChild(childInstance.dom);
  }

  return {
    element,
    dom,
    childInstances,
    rootContainer,
  };
}

function updateDomProperties(dom: HTMLElement, prevProps: PropsConfig, nextProps: PropsConfig): void {
  const isEvent = (name: string) => name.startsWith("on");
  const isProperty = (name: string) => name !== "children" && !isEvent(name);

  for (const name of Object.keys(prevProps)) {
    if (isEvent(name)) {
      const eventType = name.toLowerCase().slice(2);
      const prevHandler = prevProps[name] as EventListener | undefined;
      const nextHandler = nextProps[name] as EventListener | undefined;
      if (prevHandler && (!nextHandler || prevHandler !== nextHandler)) {
        dom.removeEventListener(eventType, prevHandler);
      }
      continue;
    }

    if (!isProperty(name)) continue;
    if (!(name in nextProps)) {
      removeProperty(dom, name, prevProps[name]);
    }
  }

  for (const name of Object.keys(nextProps)) {
    if (isEvent(name)) {
      const eventType = name.toLowerCase().slice(2);
      const prevHandler = prevProps[name] as EventListener | undefined;
      const nextHandler = nextProps[name] as EventListener | undefined;
      if (prevHandler !== nextHandler && nextHandler) {
        if (prevHandler) dom.removeEventListener(eventType, prevHandler);
        dom.addEventListener(eventType, nextHandler);
      }
      continue;
    }

    if (!isProperty(name)) continue;
    if (prevProps[name] !== nextProps[name]) {
      setProperty(dom, name, nextProps[name]);
    }
  }
}

function setProperty(dom: HTMLElement, name: string, value: unknown): void {
  if (name === "className") {
    dom.setAttribute("class", String(value));
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    Object.assign(dom.style, value);
    return;
  }

  if (name in dom) {
    (dom as unknown as Record<string, unknown>)[name] = value;
    return;
  }

  dom.setAttribute(name, String(value));
}

function removeProperty(dom: HTMLElement, name: string, oldValue: unknown): void {
  if (name === "className") {
    dom.removeAttribute("class");
    return;
  }

  if (name === "style" && typeof oldValue === "object" && oldValue !== null) {
    for (const styleName of Object.keys(oldValue)) {
      dom.style[styleName as never] = "";
    }
    return;
  }

  if (name in dom) {
    (dom as unknown as Record<string, unknown>)[name] = "";
    return;
  }

  dom.removeAttribute(name);
}
