/**
 * @angora-js/compiler - Template AST Node Definitions
 * Represents parsed Angular-style template syntax.
 */

export type ASTNode =
  | ElementNode
  | TextNode
  | InterpolationNode
  | IfBlockNode
  | ForBlockNode
  | SwitchBlockNode
  | DeferBlockNode
  | CommentNode;

export interface SourceSpan {
  start: number;
  end: number;
}

export interface ReferenceNode {
  type: 'reference';
  name: string;
  value?: string;
}

export interface ElementNode {
  type: 'element';
  name: string;
  attributes: AttributeNode[];
  properties: PropertyBindingNode[];
  events: EventBindingNode[];
  twoWayBindings: TwoWayBindingNode[];
  references: ReferenceNode[];
  children: ASTNode[];
  span?: SourceSpan;
}

export interface AttributeNode {
  type: 'attribute';
  name: string;
  value: string;
}

export interface PropertyBindingNode {
  type: 'property';
  name: string; // e.g. "disabled" from [disabled]="expr"
  expression: string;
}

export interface EventBindingNode {
  type: 'event';
  name: string; // e.g. "click" from (click)="handler($event)"
  handler: string;
}

export interface TwoWayBindingNode {
  type: 'twoWay';
  name: string; // e.g. "value" from [(value)]="mySignal"
  expression: string;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface InterpolationNode {
  type: 'interpolation';
  expression: string; // e.g. "name()" from {{ name() }}
}

export interface IfBranch {
  condition?: string; // undefined for @else
  children: ASTNode[];
}

export interface IfBlockNode {
  type: 'ifBlock';
  branches: IfBranch[]; // @if, @else if, @else
}

export interface ForBlockNode {
  type: 'forBlock';
  itemName: string; // e.g. "user" in "@for (user of users(); track user.id)"
  iterable: string; // e.g. "users()"
  trackBy: string; // e.g. "user.id"
  children: ASTNode[];
  emptyBlock?: ASTNode[]; // @empty { ... }
  emptyChildren?: ASTNode[];
}

export interface SwitchCase {
  caseValue?: string; // undefined for @default
  children: ASTNode[];
}

export interface SwitchBlockNode {
  type: 'switchBlock';
  expression: string;
  cases: SwitchCase[];
}

export interface CommentNode {
  type: 'comment';
  value: string;
}

export type DeferTriggerType = 'idle' | 'viewport' | 'interaction' | 'hover' | 'timer' | 'when';

export interface DeferTrigger {
  type: DeferTriggerType;
  param?: string;
}

export interface DeferBlockNode {
  type: 'deferBlock';
  triggers: DeferTrigger[];
  mainBlock: ASTNode[];
  placeholderBlock?: {
    children: ASTNode[];
    minimum?: number;
  };
  loadingBlock?: {
    children: ASTNode[];
    after?: number;
    minimum?: number;
  };
  errorBlock?: {
    children: ASTNode[];
  };
}
