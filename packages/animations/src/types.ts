export interface AnimationOptions {
  duration?: number;
  easing?: string;
  delay?: number;
  fill?: FillMode;
}

export interface FlipOptions extends AnimationOptions {
  stagger?: number;
}

export interface TransitionKeyframe {
  opacity?: number | string;
  transform?: string;
  [key: string]: any;
}

export interface TransitionOptions extends AnimationOptions {
  from?: TransitionKeyframe;
  to?: TransitionKeyframe;
}

export interface TransitionDef {
  enter?: (el: HTMLElement) => Promise<void>;
  leave?: (el: HTMLElement) => Promise<void>;
}
