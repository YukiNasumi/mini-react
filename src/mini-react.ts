const TEXT_ELEMENT = "TEXT_ELEMENT";

type Key = string | number | null;
type Component<P = any> = (props: P) => ReactElement | null;
type ElementType = string | typeof TEXT_ELEMENT | Component<any>;
type ChildValue = ReactElement | string | number | boolean | null | undefined;
type Child = ChildValue | ChildValue[];
type StateUpdater<T> = T | ((prev: T) => T);

export type PropsConfig = Record<string, unknown> & {
  key?: Key;
};

export type ReactElement = {
  type: ElementType;
  key: Key;
  props: PropsConfig & {
    children: ReactElement[];
    nodeValue?: string;
  };
};

type Hook<T = unknown> = {
  state: T;
};

type BaseFiber = {
  element: ReactElement;
  dom: Node | null;
  rootContainer: Element;
};

type TextFiber = BaseFiber & {
  dom: Text;
};

type DomFiber = BaseFiber & {
  dom: HTMLElement;
  childFibers: Fiber[];
};

type FunctionFiber = BaseFiber & {
  hooks: Hook[];
  hookIndex: number;
  childFiber: Fiber | null;
};

type Fiber = TextFiber | DomFiber | FunctionFiber;

// TODO: A real Fiber implementation also needs interruptible units of work,
// child/sibling/return links, current/work-in-progress double buffering with
// alternate pointers, update priorities/lanes, separate render and commit
// phases, and effect collection followed by a unified commit.

type RootRecord = {
  element: ReactElement | null;
  fiber: Fiber | null;
};

function createTextElement(value: string | number): ReactElement {
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
): ReactElement {
  const props: PropsConfig & { children: ReactElement[] } = { ...(config || {}), children: [] };
  const key = props.key ?? null;
  delete props.key;

  const flatChildren = childrenArgs.flat() as ChildValue[];
  props.children = flatChildren
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true)
    .map((child) => (typeof child === "object" ? child : createTextElement(child)));

  return { type, key, props };
}

const roots = new Map<Element, RootRecord>();
let currentFunctionFiber: FunctionFiber | null = null;

export function render(element: ReactElement, container: Element): void {
  const root = roots.get(container) || { element: null, fiber: null };
  const nextFiber = reconcile(container, root.fiber, element, container);
  roots.set(container, { element, fiber: nextFiber });
}

function rerender(container: Element): void {
  const root = roots.get(container);
  if (!root || !root.element) return;
  const nextFiber = reconcile(container, root.fiber, root.element, container);
  roots.set(container, { ...root, fiber: nextFiber });
}

export function useState<T>(initialValue: T | (() => T)): [T, (nextValue: StateUpdater<T>) => void] {
  if (!currentFunctionFiber) {
    throw new Error("useState can only be called inside a function component.");
  }

  const hooks = currentFunctionFiber.hooks as Hook<T>[];
  const idx = currentFunctionFiber.hookIndex++;

  if (hooks.length <= idx) {
    hooks.push({
      state: typeof initialValue === "function" ? (initialValue as () => T)() : initialValue,
    });
  }

  const hook = hooks[idx];
  const container = currentFunctionFiber.rootContainer;

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
  fiber: Fiber | null,
  element: ReactElement | null,
  rootContainer: Element
): Fiber | null {
  if (fiber == null) {
    if (element == null) return null;
    const newFiber = createFiber(element, rootContainer);
    if (newFiber?.dom) {
      parentDom.appendChild(newFiber.dom);
    }
    return newFiber;
  }

  if (element == null) {
    if (fiber.dom) {
      parentDom.removeChild(fiber.dom);
    }
    return null;
  }

  if (fiber.element.type !== element.type) {
    const newFiber = createFiber(element, rootContainer);
    if (fiber.dom && newFiber?.dom) {
      parentDom.replaceChild(newFiber.dom, fiber.dom);
    } else if (fiber.dom && !newFiber?.dom) {
      parentDom.removeChild(fiber.dom);
    } else if (!fiber.dom && newFiber?.dom) {
      parentDom.appendChild(newFiber.dom);
    }
    return newFiber;
  }

  if (typeof element.type === "function") {
    const functionFiber = fiber as FunctionFiber;
    functionFiber.element = element;
    functionFiber.rootContainer = rootContainer;
    functionFiber.hookIndex = 0;

    const prevFiber = currentFunctionFiber;
    currentFunctionFiber = functionFiber;
    const childElement = element.type(element.props);
    currentFunctionFiber = prevFiber;

    const childFiber = reconcile(parentDom, functionFiber.childFiber, childElement, rootContainer);

    functionFiber.dom = childFiber ? childFiber.dom : null;
    functionFiber.childFiber = childFiber;
    return functionFiber;
  }

  if (element.type === TEXT_ELEMENT) {
    const textFiber = fiber as TextFiber;
    if (textFiber.dom.nodeValue !== element.props.nodeValue) {
      textFiber.dom.nodeValue = element.props.nodeValue ?? "";
    }
    textFiber.element = element;
    return textFiber;
  }

  const domFiber = fiber as DomFiber;
  updateDomProperties(domFiber.dom, domFiber.element.props, element.props);
  domFiber.childFibers = reconcileChildrenByKey(domFiber, element, rootContainer);
  domFiber.element = element;
  return domFiber;
}

function reconcileChildrenByKey(fiber: DomFiber, element: ReactElement, rootContainer: Element): Fiber[] {
  const parentDom = fiber.dom;
  const oldChildFibers = fiber.childFibers;
  const newChildElements = element.props.children || [];

  const oldKeyed = new Map<Key, Fiber>();
  const oldUnkeyed: Fiber[] = [];

  for (const oldFiber of oldChildFibers) {
    const oldKey = oldFiber.element.key;
    if (oldKey !== null && oldKey !== undefined) {
      oldKeyed.set(oldKey, oldFiber);
    } else {
      oldUnkeyed.push(oldFiber);
    }
  }

  let unkeyedIndex = 0;
  const nextChildFibers: Fiber[] = [];

  for (const childElement of newChildElements) {
    const key = childElement.key;
    let matchedOld: Fiber | null = null;

    if (key !== null && key !== undefined) {
      matchedOld = oldKeyed.get(key) || null;
      if (matchedOld) oldKeyed.delete(key);
    } else {
      matchedOld = oldUnkeyed[unkeyedIndex] || null;
      unkeyedIndex += 1;
    }

    const nextChild = reconcile(parentDom, matchedOld, childElement, rootContainer);
    if (nextChild) nextChildFibers.push(nextChild);
  }

  for (const leftover of oldKeyed.values()) {
    reconcile(parentDom, leftover, null, rootContainer);
  }

  for (let i = unkeyedIndex; i < oldUnkeyed.length; i += 1) {
    reconcile(parentDom, oldUnkeyed[i], null, rootContainer);
  }

  // Keep DOM order aligned with virtual children order.
  for (let i = 0; i < nextChildFibers.length; i += 1) {
    const childDom = nextChildFibers[i].dom;
    if (!childDom) continue;
    const domAtIndex = parentDom.childNodes[i] || null;
    if (childDom !== domAtIndex) {
      parentDom.insertBefore(childDom, domAtIndex);
    }
  }

  return nextChildFibers;
}

function createFiber(element: ReactElement | null, rootContainer: Element): Fiber | null {
  if (element == null) return null;

  const { type, props } = element;

  if (typeof type === "function") {
    const fiber: FunctionFiber = {
      element,
      dom: null,
      childFiber: null,
      hooks: [],
      hookIndex: 0,
      rootContainer,
    };

    const prevFiber = currentFunctionFiber;
    currentFunctionFiber = fiber;
    const childElement = type(props);
    currentFunctionFiber = prevFiber;

    const childFiber = createFiber(childElement, rootContainer);
    fiber.dom = childFiber ? childFiber.dom : null;
    fiber.childFiber = childFiber;
    return fiber;
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

  const childFibers = props.children
    .map((childElement) => createFiber(childElement, rootContainer))
    .filter((childFiber): childFiber is Fiber => Boolean(childFiber));

  for (const childFiber of childFibers) {
    if (childFiber.dom) dom.appendChild(childFiber.dom);
  }

  return {
    element,
    dom,
    childFibers,
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
