import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AngoraLanguageService, AngoraLspServer } from '../src/index.ts';

describe('@angora-js/cli - Language Server Protocol (LSP)', () => {
  const service = new AngoraLanguageService();

  const componentSource = `import { Component, signal } from '@angora-js/core';
import { UserProfileComponent } from './user-profile.component';
import { DateFormatterPipe } from './date-formatter.pipe';

@Component({
  selector: 'app-user',
  imports: [UserProfileComponent, DateFormatterPipe],
  template: \`
    <div class="user-container">
      <h1>{{ title() | uppercase }}</h1>
      <p>{{ createdAt() | date:'short' }}</p>
      <input [disabled]="isLocked()" [value]="title()" />
      <input [disabled]="title()" />
      <input [disabled]="isLocked" />
      <user-profile />
      <unknown-widget />
      <button (click)="saveUser($event)">Save</button>
      <span>{{ nonExistentProp }}</span>
    </div>
  \`
})
export class UserComponent {
  /** The headline of the user panel */
  title = signal<string>('User Management');

  /** Creation timestamp */
  createdAt = signal<number>(Date.now());

  /** Whether the user account is locked */
  isLocked = signal<boolean>(false);

  /** Saves the user profile */
  saveUser(event: any): void {
    console.log(event);
  }
}
`;

  const uri = 'file:///workspace/src/user.component.ts';

  test('should diagnose type errors, missing properties, uncalled signals, and unknown elements', () => {
    const diags = service.getDiagnostics(uri, componentSource);

    // 1. [disabled]="title()" (string vs boolean)
    const stringToBool = diags.find(
      d =>
        d.code === 'TS2322' &&
        d.message.includes("Type 'string' is not assignable to type 'boolean'")
    );
    expect(stringToBool).toBeDefined();

    // 2. [disabled]="isLocked" (Signal<boolean> uncalled)
    const uncalled = diags.find(
      d => d.code === 'TS2322' && d.message.includes("Did you mean to call 'isLocked()'")
    );
    expect(uncalled).toBeDefined();

    // 3. {{ nonExistentProp }} (missing property)
    const missingProp = diags.find(
      d => d.code === 'TS2339' && d.message.includes("Property 'nonExistentProp' does not exist")
    );
    expect(missingProp).toBeDefined();

    // 4. <unknown-widget /> (unknown element NG8001)
    const unknownElem = diags.find(
      d => d.code === 'NG8001' && d.message.includes("'unknown-widget' is not a known element")
    );
    expect(unknownElem).toBeDefined();
  });

  test('should provide rich hover information for properties, methods, element attributes, and pipes', () => {
    const lines = componentSource.split('\n');

    // Hover on 'title' inside <h1>{{ title() | uppercase }}</h1>
    const titleLine = lines.findIndex(l => l.includes('title() | uppercase'));
    const titleChar = lines[titleLine].indexOf('title');
    const titleHover = service.getHover(uri, componentSource, {
      line: titleLine,
      character: titleChar,
    });
    expect(titleHover).not.toBeNull();
    expect(titleHover?.contents).toContain('(property) UserComponent.title: Signal<string>');
    expect(titleHover?.contents).toContain('The headline of the user panel');

    // Hover on 'saveUser' inside (click)="saveUser($event)"
    const saveLine = lines.findIndex(l => l.includes('saveUser($event)'));
    const saveChar = lines[saveLine].indexOf('saveUser');
    const saveHover = service.getHover(uri, componentSource, {
      line: saveLine,
      character: saveChar,
    });
    expect(saveHover).not.toBeNull();
    expect(saveHover?.contents).toContain('(method) UserComponent.saveUser(event: any): void');
    expect(saveHover?.contents).toContain('Saves the user profile');

    // Hover on '[disabled]'
    const disabledLine = lines.findIndex(l => l.includes('[disabled]="isLocked()"'));
    const disabledChar = lines[disabledLine].indexOf('disabled');
    const disabledHover = service.getHover(uri, componentSource, {
      line: disabledLine,
      character: disabledChar,
    });
    expect(disabledHover).not.toBeNull();
    expect(disabledHover?.contents).toContain('(property) HTMLInputElement.disabled: boolean');

    // Hover on pipe 'uppercase'
    const pipeChar = lines[titleLine].indexOf('uppercase');
    const pipeHover = service.getHover(uri, componentSource, {
      line: titleLine,
      character: pipeChar,
    });
    expect(pipeHover).not.toBeNull();
    expect(pipeHover?.contents).toContain('### `uppercase` Pipe');
  });

  test('should resolve definitions (F12) for variables, components, and pipes', () => {
    const lines = componentSource.split('\n');

    // F12 on 'title'
    const titleLine = lines.findIndex(l => l.includes('title() | uppercase'));
    const titleChar = lines[titleLine].indexOf('title');
    const titleDef = service.getDefinition(uri, componentSource, {
      line: titleLine,
      character: titleChar,
    });
    expect(titleDef.length).toBe(1);
    expect(titleDef[0].symbol).toBe('title');
    expect(titleDef[0].range.start.line).toBe(lines.findIndex(l => l.includes('title = signal')));

    // F12 on '<user-profile />'
    const profileLine = lines.findIndex(l => l.includes('<user-profile />'));
    const profileChar = lines[profileLine].indexOf('user-profile');
    const profileDef = service.getDefinition(uri, componentSource, {
      line: profileLine,
      character: profileChar,
    });
    expect(profileDef.length).toBe(1);
    expect(profileDef[0].symbol).toBe('UserProfileComponent');
    expect(profileDef[0].uri).toContain('user-profile.component.ts');
  });

  test('should handle LSP JSON-RPC messages in AngoraLspServer', () => {
    const server = new AngoraLspServer();

    // 1. Initialize request
    let initResponse: any = null;
    server['sendResponse'] = (_id: any, res: any) => {
      initResponse = res;
    };

    server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });

    expect(initResponse).not.toBeNull();
    expect(initResponse.capabilities.hoverProvider).toBe(true);
    expect(initResponse.capabilities.definitionProvider).toBe(true);
    expect(initResponse.serverInfo.name).toBe('angora-language-server');

    // 2. Open document and check published diagnostics
    let publishedUri = '';
    let publishedDiags: any[] = [];
    server['sendNotification'] = (method: string, params: any) => {
      if (method === 'textDocument/publishDiagnostics') {
        publishedUri = params.uri;
        publishedDiags = params.diagnostics;
      }
    };

    server.handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'typescript',
          version: 1,
          text: componentSource,
        },
      },
    });

    expect(publishedUri).toBe(uri);
    expect(publishedDiags.length).toBeGreaterThan(0);

    // 3. Hover request via LSP
    let hoverResult: any = null;
    server['sendResponse'] = (_id: any, res: any) => {
      hoverResult = res;
    };

    const lines = componentSource.split('\n');
    const titleLine = lines.findIndex(l => l.includes('title() | uppercase'));
    const titleChar = lines[titleLine].indexOf('title');

    server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/hover',
      params: {
        textDocument: { uri },
        position: { line: titleLine, character: titleChar },
      },
    });

    expect(hoverResult).not.toBeNull();
    expect(hoverResult.contents.value).toContain('(property) UserComponent.title: Signal<string>');

    // 4. Definition request via LSP
    let defResult: any = null;
    server['sendResponse'] = (_id: any, res: any) => {
      defResult = res;
    };

    server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/definition',
      params: {
        textDocument: { uri },
        position: { line: titleLine, character: titleChar },
      },
    });

    expect(defResult).not.toBeNull();
    expect(defResult.length).toBe(1);
    expect(defResult[0].range.start.line).toBe(lines.findIndex(l => l.includes('title = signal')));
  });

  test('should accurately recognize inject() and constructor parameters without reporting TS2339 errors', () => {
    const diComponent = `import { Component, inject } from '@angora-js/core';
import { ToastService } from './toast.service';
import { Router } from './router';

@Component({
  selector: 'app-checkout',
  template: \`
    <div>
      <button (click)="toastService.show('Order placed!')">Order</button>
      <button (click)="router.navigate('/home')">Home</button>
      <span [title]="toastService.lastMessage">{{ greeting }}</span>
    </div>
  \`
})
export class CheckoutComponent {
  /** The application notification service */
  toastService = inject(ToastService);
  readonly router = inject<Router>(Router);
  get greeting(): string {
    return 'Hello World';
  }
}
`;
    const diUri = 'file:///workspace/src/checkout.component.ts';
    const diags = service.getDiagnostics(diUri, diComponent);
    expect(diags.filter(d => d.code === 'TS2339').length).toBe(0);

    // Test Hover on toastService
    const lines = diComponent.split('\n');
    const toastLine = lines.findIndex(l => l.includes('toastService.show'));
    const toastChar = lines[toastLine].indexOf('toastService');
    const toastHover = service.getHover(diUri, diComponent, {
      line: toastLine,
      character: toastChar,
    });
    expect(toastHover).not.toBeNull();
    expect(toastHover?.contents).toContain(
      '(property) CheckoutComponent.toastService: ToastService'
    );
    expect(toastHover?.contents).toContain('The application notification service');

    // Test F12 Go to Definition on toastService
    const toastDef = service.getDefinition(diUri, diComponent, {
      line: toastLine,
      character: toastChar,
    });
    expect(toastDef.length).toBe(1);
    expect(toastDef[0].symbol).toBe('toastService');
    expect(toastDef[0].range.start.line).toBe(
      lines.findIndex(l => l.includes('toastService = inject'))
    );

    // Test Hover on greeting (getter)
    const greetLine = lines.findIndex(l => l.includes('{{ greeting }}'));
    const greetChar = lines[greetLine].indexOf('greeting');
    const greetHover = service.getHover(diUri, diComponent, {
      line: greetLine,
      character: greetChar,
    });
    expect(greetHover).not.toBeNull();
    expect(greetHover?.contents).toContain('(property) CheckoutComponent.greeting: string');
  });

  test('should completely ignore commented-out code in templates (HTML comments, block comments, and line comments)', () => {
    const commentedComponent = `import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-comment-test',
  template: \`
    <div>
      <!-- HTML comment with non-existent variables and unimported components -->
      <!--
        <unknown-widget [unknownInput]="nonExistentProp" />
        <h1>{{ completelyFakeProp | unknownPipe }}</h1>
        <button (click)="fakeMethod()">Click</button>
        @if (nonExistentCondition) {
          <span>hidden</span>
        }
      -->

      /*
        <unregistered-card>{{ alsoFake }}</unregistered-card>
      */

      // <another-unknown [bad]="invalid" />
      // {{ lineCommentedFake }}

      <!-- Single line comment -->
      <!-- <bad-element [disabled]="notReal"></bad-element> -->

      <!-- Active uncommented code -->
      <h1>{{ activeTitle() }}</h1>
    </div>
  \`
})
export class CommentTestComponent {
  activeTitle = signal<string>('Valid Title');
}
`;
    const commentUri = 'file:///workspace/src/comment-test.component.ts';
    const diags = service.getDiagnostics(commentUri, commentedComponent);

    // ZERO diagnostics should be reported because all invalid code is inside comments!
    expect(diags).toHaveLength(0);

    // Hover on activeTitle works
    const lines = commentedComponent.split('\n');
    const titleLine = lines.findIndex(l => l.includes('activeTitle()'));
    const titleChar = lines[titleLine].indexOf('activeTitle');
    const titleHover = service.getHover(commentUri, commentedComponent, {
      line: titleLine,
      character: titleChar,
    });
    expect(titleHover).not.toBeNull();
    expect(titleHover?.contents).toContain('activeTitle');

    // Hover inside comment returns null
    const commentLine = lines.findIndex(l => l.includes('completelyFakeProp'));
    const commentChar = lines[commentLine].indexOf('completelyFakeProp');
    const commentHover = service.getHover(commentUri, commentedComponent, {
      line: commentLine,
      character: commentChar,
    });
    expect(commentHover).toBeNull();
  });

  test('should support multi-level chained property/method/signal navigation (e.g. toastService.toasts().length) and check types across the chain', () => {
    const chainedComponent = `import { Component, inject, signal } from '@angora-js/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-notification-panel',
  template: \`
    <div>
      <!-- Multi-level chained signal & property access -->
      <span>Total toasts: {{ toastService.toasts().length }}</span>
      <button [disabled]="toastService.toasts().length">Invalid binding</button>
      <button [disabled]="toastService.toasts().length === 0">Valid binding</button>
    </div>
  \`
})
export class NotificationPanelComponent {
  toastService = inject(ToastService);
}
`;
    const chainUri = 'file:///workspace/src/notification-panel.component.ts';
    const diags = service.getDiagnostics(chainUri, chainedComponent);

    // 1. [disabled]="toastService.toasts().length" should fail type check TS2322 (number is not boolean)
    const typeMismatch = diags.find(
      d =>
        d.code === 'TS2322' &&
        d.message.includes("Type 'number' is not assignable to type 'boolean'")
    );
    expect(typeMismatch).toBeDefined();

    // 2. No false TS2339 on toasts or length or toastService
    const missingProps = diags.filter(d => d.code === 'TS2339');
    expect(missingProps).toHaveLength(0);

    // 3. Hover on 'length' should indicate number type from array
    const lines = chainedComponent.split('\n');
    const lengthLine = lines.findIndex(l => l.includes('toastService.toasts().length }}'));
    const lengthChar = lines[lengthLine].indexOf('length');
    const lengthHover = service.getHover(chainUri, chainedComponent, {
      line: lengthLine,
      character: lengthChar,
    });
    expect(lengthHover).not.toBeNull();
    expect(lengthHover?.contents).toContain('length: number');

    // 4. Hover on 'toasts' should indicate Toast[] type
    const toastsChar = lines[lengthLine].indexOf('toasts()');
    const toastsHover = service.getHover(chainUri, chainedComponent, {
      line: lengthLine,
      character: toastsChar,
    });
    expect(toastsHover).not.toBeNull();
    expect(toastsHover?.contents).toMatch(/toasts: Toast(Item)?\[\]/);

    // 5. Hover on 'toastService' should indicate ToastService type
    const serviceChar = lines[lengthLine].indexOf('toastService');
    const serviceHover = service.getHover(chainUri, chainedComponent, {
      line: lengthLine,
      character: serviceChar,
    });
    expect(serviceHover).not.toBeNull();
    expect(serviceHover?.contents).toContain(
      'NotificationPanelComponent.toastService: ToastService'
    );
  });

  test('should support template-scoped variables: @for loop items, contextual variables, and template references (#ref)', () => {
    const scopedComponent = `import { Component, signal } from '@angora-js/core';

interface Product {
  id: number;
  name: string;
  price: number;
}

@Component({
  selector: 'app-product-list',
  template: \`
    <div>
      <input #filterBox [value]="filterText()" />
      <button [disabled]="filterBox.value.length === 0" (click)="filterBox.focus()">Clear</button>

      @for (item of products(); track item.id; let idx = $index) {
        <div class="item-row">
          <span>#{{ $index }}: {{ item.name }} - \${{ item.price }}</span>
          <span [hidden]="$first">Not first</span>
          <span [hidden]="$last">Not last</span>
        </div>
      }
    </div>
  \`
})
export class ProductListComponent {
  filterText = signal<string>('');
  products = signal<Product[]>([
    { id: 1, name: 'Angora Pro', price: 99 },
    { id: 2, name: 'Angora Studio', price: 199 }
  ]);
}
`;
    const scopedUri = 'file:///workspace/src/product-list.component.ts';
    const diags = service.getDiagnostics(scopedUri, scopedComponent);

    // ZERO TS2339 errors: filterBox, item, $index, $first, $last, and idx are all known!
    const ts2339 = diags.filter(d => d.code === 'TS2339');
    expect(ts2339).toHaveLength(0);

    const lines = scopedComponent.split('\n');

    // 1. Hover on #filterBox template reference
    const inputLine = lines.findIndex(l => l.includes('<input #filterBox'));
    const filterBoxRefChar = lines[inputLine].indexOf('filterBox');
    const filterBoxHover = service.getHover(scopedUri, scopedComponent, {
      line: inputLine,
      character: filterBoxRefChar,
    });
    expect(filterBoxHover).not.toBeNull();
    expect(filterBoxHover?.contents).toContain('#filterBox: HTMLInputElement');

    // 2. Hover on filterBox in expression [disabled]="filterBox.value.length === 0"
    const btnLine = lines.findIndex(l => l.includes('[disabled]="filterBox.value.length === 0"'));
    const filterBoxUseChar = lines[btnLine].indexOf('filterBox');
    const filterBoxUseHover = service.getHover(scopedUri, scopedComponent, {
      line: btnLine,
      character: filterBoxUseChar,
    });
    expect(filterBoxUseHover).not.toBeNull();
    expect(filterBoxUseHover?.contents).toContain('#filterBox: HTMLInputElement');

    // 3. Hover on filterBox.value
    const valueChar = lines[btnLine].indexOf('value');
    const valueHover = service.getHover(scopedUri, scopedComponent, {
      line: btnLine,
      character: valueChar,
    });
    expect(valueHover).not.toBeNull();
    expect(valueHover?.contents).toContain('value: string');

    // 4. Hover on @for loop item
    const itemLine = lines.findIndex(l => l.includes('item.name'));
    const itemChar = lines[itemLine].indexOf('item');
    const itemHover = service.getHover(scopedUri, scopedComponent, {
      line: itemLine,
      character: itemChar,
    });
    expect(itemHover).not.toBeNull();
    expect(itemHover?.contents).toContain('(parameter) item: Product');

    // 5. Hover on @for context variable $index
    const indexChar = lines[itemLine].indexOf('$index');
    const indexHover = service.getHover(scopedUri, scopedComponent, {
      line: itemLine,
      character: indexChar,
    });
    expect(indexHover).not.toBeNull();
    expect(indexHover?.contents).toContain('(context variable) $index: number');

    // 6. F12 Go to Definition on 'filterBox' jumps to <input #filterBox>
    const defFilterBox = service.getDefinition(scopedUri, scopedComponent, {
      line: btnLine,
      character: filterBoxUseChar,
    });
    expect(defFilterBox.length).toBe(1);
    expect(defFilterBox[0].symbol).toBe('filterBox');
    expect(defFilterBox[0].range.start.line).toBe(inputLine);

    // 7. F12 Go to Definition on 'item' jumps to @for declaration
    const defItem = service.getDefinition(scopedUri, scopedComponent, {
      line: itemLine,
      character: itemChar,
    });
    expect(defItem.length).toBe(1);
    expect(defItem[0].symbol).toBe('item');
    const forLine = lines.findIndex(l => l.includes('@for (item of products()'));
    expect(defItem[0].range.start.line).toBe(forLine);

    // 8. Autocompletions should suggest template variables: filterBox, item, $index
    const completions = service.getCompletions(scopedUri, scopedComponent, {
      line: itemLine,
      character: 0,
    });
    expect(completions.some(c => c.label === 'filterBox')).toBe(true);
    expect(completions.some(c => c.label === 'item')).toBe(true);
    expect(completions.some(c => c.label === '$index')).toBe(true);
  });

  test('should resolve real imported types from external files (e.g. ToastService -> ToastItem[] -> item.type: ToastType)', () => {
    const toastContainerPath = path.resolve(__dirname, '../../ui/src/toast-container.component.ts');
    const toastServicePath = path.resolve(__dirname, '../../ui/src/toast.service.ts');
    expect(fs.existsSync(toastContainerPath)).toBe(true);
    expect(fs.existsSync(toastServicePath)).toBe(true);

    const toastContainerContent = fs.readFileSync(toastContainerPath, 'utf-8');
    const toastUri = `file://${toastContainerPath}`;

    // 1. Diagnostics: no errors in toast-container.component.ts
    const diags = service.getDiagnostics(toastUri, toastContainerContent);
    expect(diags.filter(d => d.code === 'TS2339')).toHaveLength(0);

    const lines = toastContainerContent.split('\n');

    // 2. Hover on toastService -> ToastService
    const ifLine = lines.findIndex(l => l.includes('toastService.toasts().length'));
    const toastServiceChar = lines[ifLine].indexOf('toastService');
    const toastServiceHover = service.getHover(toastUri, toastContainerContent, {
      line: ifLine,
      character: toastServiceChar,
    });
    expect(toastServiceHover).not.toBeNull();
    expect(toastServiceHover?.contents).toContain('toastService: ToastService');

    // 3. Hover on toasts() -> ToastItem[] (NOT Toast[])
    const toastsChar = lines[ifLine].indexOf('toasts');
    const toastsHover = service.getHover(toastUri, toastContainerContent, {
      line: ifLine,
      character: toastsChar,
    });
    expect(toastsHover).not.toBeNull();
    expect(toastsHover?.contents).toContain('ToastService.toasts: ToastItem[]');

    // 4. Hover on length in toasts().length -> number
    const lengthChar = lines[ifLine].indexOf('length');
    const lengthHover = service.getHover(toastUri, toastContainerContent, {
      line: ifLine,
      character: lengthChar,
    });
    expect(lengthHover).not.toBeNull();
    expect(lengthHover?.contents).toContain('ToastItem[].length: number');

    // 5. Hover on item in @for -> ToastItem
    const forLine = lines.findIndex(l => l.includes('@for (item of toastService.toasts()'));
    const itemChar = lines[forLine].indexOf('item');
    const itemHover = service.getHover(toastUri, toastContainerContent, {
      line: forLine,
      character: itemChar,
    });
    expect(itemHover).not.toBeNull();
    expect(itemHover?.contents).toContain('(parameter) item: ToastItem');

    // 6. Hover on item.type in [class.angora-toast-item--info]="item.type === 'info'" -> ToastType
    const typeLine = lines.findIndex(l => l.includes("item.type === 'info'"));
    const typeChar = lines[typeLine].indexOf('type');
    const typeHover = service.getHover(toastUri, toastContainerContent, {
      line: typeLine,
      character: typeChar,
    });
    expect(typeHover).not.toBeNull();
    expect(typeHover?.contents).toContain('ToastItem.type: ToastType');
    expect(typeHover?.contents).toContain(
      "type ToastType = 'info' | 'success' | 'warning' | 'error'"
    );

    // 7. Hover on item.message -> string
    const msgLine = lines.findIndex(l => l.includes('item.message'));
    const msgChar = lines[msgLine].indexOf('message');
    const msgHover = service.getHover(toastUri, toastContainerContent, {
      line: msgLine,
      character: msgChar,
    });
    expect(msgHover).not.toBeNull();
    expect(msgHover?.contents).toContain('ToastItem.message: string');

    // 8. F12 on toasts in toastService.toasts() jumps to toast.service.ts toasts declaration
    const defToasts = service.getDefinition(toastUri, toastContainerContent, {
      line: ifLine,
      character: toastsChar,
    });
    expect(defToasts.length).toBe(1);
    expect(defToasts[0].symbol).toBe('toasts');
    expect(defToasts[0].uri).toContain('toast.service.ts');

    // 9. F12 on type in item.type jumps to toast.service.ts ToastItem.type declaration
    const defType = service.getDefinition(toastUri, toastContainerContent, {
      line: typeLine,
      character: typeChar,
    });
    expect(defType.length).toBe(1);
    expect(defType[0].symbol).toBe('type');
    expect(defType[0].uri).toContain('toast.service.ts');

    // 10. F12 on dismiss in toastService.dismiss jumps to toast.service.ts dismiss method
    const dismissLine = lines.findIndex(l => l.includes('toastService.dismiss'));
    const dismissChar = lines[dismissLine].indexOf('dismiss');
    const defDismiss = service.getDefinition(toastUri, toastContainerContent, {
      line: dismissLine,
      character: dismissChar,
    });
    expect(defDismiss.length).toBe(1);
    expect(defDismiss[0].symbol).toBe('dismiss');
    expect(defDismiss[0].uri).toContain('toast.service.ts');

    // 11. Hover on toastService.toasts() INSIDE @for loop (Line 9) must show ToastItem[] (NOT Toast[])
    const forToastsChar = lines[forLine].indexOf('toasts');
    const forToastsHover = service.getHover(toastUri, toastContainerContent, {
      line: forLine,
      character: forToastsChar,
    });
    expect(forToastsHover).not.toBeNull();
    expect(forToastsHover?.contents).toContain('ToastService.toasts: ToastItem[]');

    // 12. Hover on item.id in trackBy INSIDE @for loop (Line 9)
    const trackIdChar = lines[forLine].indexOf('item.id') + 5;
    const trackIdHover = service.getHover(toastUri, toastContainerContent, {
      line: forLine,
      character: trackIdChar,
    });
    expect(trackIdHover).not.toBeNull();
    expect(trackIdHover?.contents).toContain('ToastItem.id: string');

    // 13. F12 on toasts in @for loop (Line 9) jumps to toast.service.ts
    const defForToasts = service.getDefinition(toastUri, toastContainerContent, {
      line: forLine,
      character: forToastsChar,
    });
    expect(defForToasts.length).toBe(1);
    expect(defForToasts[0].symbol).toBe('toasts');
    expect(defForToasts[0].uri).toContain('toast.service.ts');

    // 14. F12 on id in trackBy @for loop (Line 9) jumps to toast.service.ts
    const defTrackId = service.getDefinition(toastUri, toastContainerContent, {
      line: forLine,
      character: trackIdChar,
    });
    expect(defTrackId.length).toBe(1);
    expect(defTrackId[0].symbol).toBe('id');
    expect(defTrackId[0].uri).toContain('toast.service.ts');
  });

  test('Feature 5: Multi-class files with @Directive, @Pipe, and @Component must bind templates to the correct component class', () => {
    const multiClassSource = `import { Component, Directive, Pipe, signal } from '@angora-js/core';

@Directive({
  selector: '[appHighlight]',
  host: { '[style.backgroundColor]': 'bgColor()' }
})
export class HighlightDirective {
  bgColor = signal('yellow');
}

@Pipe({
  name: 'reverse'
})
export class ReversePipe {
  transform(val: string): string { return val; }
}

@Component({
  selector: 'app-multi-demo',
  template: \`
    <div>
      <p>{{ title() }}</p>
      <span>{{ count() }}</span>
      <button (click)="increment()">Increment</button>
    </div>
  \`
})
export class MultiDemoComponent {
  title = signal('Multi-Class Component');
  count = signal(42);

  increment() {
    this.count.update(c => c + 1);
  }
}
`;

    const multiUri = 'file:///workspace/src/multi-demo.component.ts';

    // 1. Diagnostics must be clean - title, count, increment belong to MultiDemoComponent, NOT HighlightDirective
    const diags = service.getDiagnostics(multiUri, multiClassSource);
    expect(diags.length).toBe(0);

    // 2. Hover on title() inside template should show MultiDemoComponent.title: Signal<string>
    const lines = multiClassSource.split('\n');
    const titleLine = lines.findIndex(l => l.includes('{{ title() }}'));
    const titleChar = lines[titleLine].indexOf('title');
    const titleHover = service.getHover(multiUri, multiClassSource, {
      line: titleLine,
      character: titleChar,
    });
    expect(titleHover).not.toBeNull();
    expect(titleHover?.contents).toContain('MultiDemoComponent.title');

    // 3. Hover on count() inside template should show MultiDemoComponent.count: Signal<number>
    const countLine = lines.findIndex(l => l.includes('{{ count() }}'));
    const countChar = lines[countLine].indexOf('count');
    const countHover = service.getHover(multiUri, multiClassSource, {
      line: countLine,
      character: countChar,
    });
    expect(countHover).not.toBeNull();
    expect(countHover?.contents).toContain('MultiDemoComponent.count');

    // 4. Test real ui-demo.component.ts with 5 classes (2 directives, 2 pipes, 1 component)
    const uiDemoPath = path.resolve(
      import.meta.dirname,
      '../../../examples/playground/src/views/ui-demo.component.ts'
    );
    if (fs.existsSync(uiDemoPath)) {
      const uiDemoContent = fs.readFileSync(uiDemoPath, 'utf-8');
      const uiDemoDiags = service.getDiagnostics('file://' + uiDemoPath, uiDemoContent);
      // Must not have TS2339 errors on AppHighlightDirective
      const falsePositives = uiDemoDiags.filter(
        d => d.message.includes('AppHighlightDirective') || d.message.includes('accountNumber')
      );
      expect(falsePositives.length).toBe(0);
    }
  });

  test('Feature 5: Multiple @Component declarations in a single file should both be verified independently', () => {
    const twoComponentsSource = `import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-first',
  template: \`<div>{{ firstProp() }}</div>\`
})
export class FirstComponent {
  firstProp = signal('Hello First');
}

@Component({
  selector: 'app-second',
  template: \`<div>{{ secondProp() }}</div>\`
})
export class SecondComponent {
  secondProp = signal('Hello Second');
}
`;

    const twoUri = 'file:///workspace/src/two-components.component.ts';
    const diags = service.getDiagnostics(twoUri, twoComponentsSource);
    expect(diags.length).toBe(0);
  });

  test('Feature 6: @defer triggers (on timer, on viewport, on idle) must not produce false TS2339 errors', () => {
    const deferSource = `import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-defer-demo',
  template: \`
    <div>
      @defer (on timer(150ms)) {
        <p>Loaded via timer!</p>
      } @placeholder {
        <p>Placeholder...</p>
      }

      @defer (on viewport; when isReady()) {
        <p>Loaded via viewport & condition!</p>
      }
    </div>
  \`
})
export class DeferDemoComponent {
  isReady = signal(true);
}
`;

    const deferUri = 'file:///workspace/src/defer-demo.component.ts';
    const diags = service.getDiagnostics(deferUri, deferSource);
    expect(diags.length).toBe(0);
  });

  test('Feature 7: Go to Definition (F12) on pipes jumps to local, imported, and built-in Pipe classes', () => {
    const pipeSource = `import { Component, Pipe, signal } from '@angora-js/core';

@Pipe({ name: 'customMask', pure: true })
export class CustomMaskPipe {
  transform(v: string): string { return v; }
}

@Component({
  selector: 'app-pipe-demo',
  template: \`
    <div>
      <p>{{ text() | customMask }}</p>
      <p>{{ text() | uppercase }}</p>
    </div>
  \`
})
export class PipeDemoComponent {
  text = signal('hello');
}
`;

    const pipeUri = 'file:///workspace/src/pipe-demo.component.ts';
    const lines = pipeSource.split('\n');

    // 1. F12 on customMask -> jumps to CustomMaskPipe class definition
    const maskLine = lines.findIndex(l => l.includes('| customMask'));
    const maskChar = lines[maskLine].indexOf('customMask');
    const maskDefs = service.getDefinition(pipeUri, pipeSource, {
      line: maskLine,
      character: maskChar,
    });
    expect(maskDefs.length).toBe(1);
    expect(maskDefs[0].symbol).toBe('CustomMaskPipe');
    expect(maskDefs[0].uri).toBe(pipeUri);

    // 2. F12 on uppercase -> jumps to UpperCasePipe class definition in @angora-js/core
    const upperLine = lines.findIndex(l => l.includes('| uppercase'));
    const upperChar = lines[upperLine].indexOf('uppercase');
    const upperDefs = service.getDefinition(pipeUri, pipeSource, {
      line: upperLine,
      character: upperChar,
    });
    expect(upperDefs.length).toBe(1);
    expect(upperDefs[0].symbol).toBe('UpperCasePipe');
    expect(upperDefs[0].uri).toContain('pipe.ts');
  });

  test('Feature 8: Reactive Forms (FormControl<T>, FormGroup<T>, FormArray<T>) strong typing, member hover, and method calls', () => {
    const formsComponent = `import { Component } from '@angora-js/core';
import { FormControl, FormGroup, FormArray, Validators } from '@angora-js/forms';

interface UserProfile {
  id: number;
  username: string;
}

@Component({
  selector: 'app-forms-test',
  template: \`
    <div>
      <input [value]="customerControl.value()" (input)="customerControl.setValue($event.target.value)" />
      @if (customerControl.valid()) {
        <span>Valid customer!</span>
      }
      @if (orderForm.dirty()) {
        <span>Form is dirty</span>
      }
      <span>Items count: {{ items.length() }}</span>
      <span>User ID: {{ userControl.value().id }}</span>
    </div>
  \`
})
export class FormsTestComponent {
  customerControl = new FormControl('Alice Wonderland', [Validators.required]);
  userControl = new FormControl<UserProfile>({ id: 42, username: 'alice' });
  items = new FormArray([]);
  orderForm = new FormGroup({});
}
`;

    const formsUri = 'file:///workspace/src/forms-test.component.ts';
    const lines = formsComponent.split('\n');

    // 1. Diagnostics: No false TS2339 errors
    const diags = service.getDiagnostics(formsUri, formsComponent);
    expect(diags.filter(d => d.code === 'TS2339')).toHaveLength(0);

    // 2. Hover on customerControl -> FormControl<string>
    const inputLine = lines.findIndex(l => l.includes('customerControl.value()'));
    const customerChar = lines[inputLine].indexOf('customerControl');
    const customerHover = service.getHover(formsUri, formsComponent, {
      line: inputLine,
      character: customerChar,
    });
    expect(customerHover).not.toBeNull();
    expect(customerHover?.contents).toContain(
      'FormsTestComponent.customerControl: FormControl<string>'
    );

    // 3. Hover on value() in customerControl.value() -> string
    const valueChar = lines[inputLine].indexOf('value()');
    const valueHover = service.getHover(formsUri, formsComponent, {
      line: inputLine,
      character: valueChar,
    });
    expect(valueHover).not.toBeNull();
    expect(valueHover?.contents).toContain('FormControl<string>.value: string');

    // 4. Hover on setValue() in customerControl.setValue(...) -> (method) setValue(newValue: string): void
    const setValueChar = lines[inputLine].indexOf('setValue(');
    const setValueHover = service.getHover(formsUri, formsComponent, {
      line: inputLine,
      character: setValueChar,
    });
    expect(setValueHover).not.toBeNull();
    expect(setValueHover?.contents).toContain(
      '(method) FormControl<string>.setValue(newValue: string): void'
    );

    // 5. Hover on valid() in customerControl.valid() -> boolean
    const validLine = lines.findIndex(l => l.includes('customerControl.valid()'));
    const validChar = lines[validLine].indexOf('valid');
    const validHover = service.getHover(formsUri, formsComponent, {
      line: validLine,
      character: validChar,
    });
    expect(validHover).not.toBeNull();
    expect(validHover?.contents).toContain('FormControl<string>.valid: boolean');

    // 6. Hover on orderForm.dirty() -> boolean
    const dirtyLine = lines.findIndex(l => l.includes('orderForm.dirty()'));
    const dirtyChar = lines[dirtyLine].indexOf('dirty');
    const dirtyHover = service.getHover(formsUri, formsComponent, {
      line: dirtyLine,
      character: dirtyChar,
    });
    expect(dirtyHover).not.toBeNull();
    expect(dirtyHover?.contents).toContain('FormGroup.dirty: boolean');

    // 7. Hover on items.length() -> number
    const lengthLine = lines.findIndex(l => l.includes('items.length()'));
    const lengthChar = lines[lengthLine].indexOf('length');
    const lengthHover = service.getHover(formsUri, formsComponent, {
      line: lengthLine,
      character: lengthChar,
    });
    expect(lengthHover).not.toBeNull();
    expect(lengthHover?.contents).toContain('FormArray.length: number');

    // 8. Strict Typed Form: userControl.value().id -> number
    const userLine = lines.findIndex(l => l.includes('userControl.value().id'));
    const idChar = lines[userLine].indexOf('id');
    const idHover = service.getHover(formsUri, formsComponent, {
      line: userLine,
      character: idChar,
    });
    expect(idHover).not.toBeNull();
    expect(idHover?.contents).toContain('id: number');
  }, 15000);

  test('Feature 9: computed() return type inference from AST return expression and dynamic class inheritance', () => {
    const service = new AngoraLanguageService();

    // 1. Verify computed return type inference
    const computedCode = `
import { Component, computed, signal } from '@angora-js/core';

@Component({
  selector: 'app-computed-test',
  template: \`
    <div>
      <span>{{ numTotal() }}</span>
      <span>{{ boolCheck() }}</span>
      <span>{{ strLabel() }}</span>
    </div>
  \`
})
export class ComputedTestComponent {
  numTotal = computed(() => {
    let x = 10;
    return parseFloat((x * 1.5).toFixed(2));
  });

  boolCheck = computed(() => {
    return 10 > 5;
  });

  strLabel = computed(() => {
    return 'Status: Active';
  });
}
`;
    const uri = 'file:///workspace/src/computed-test.component.ts';
    const lines = computedCode.split('\n');

    // Diagnostics check
    const diags = service.getDiagnostics(uri, computedCode);
    expect(diags.filter(d => d.code === 'TS2339')).toHaveLength(0);

    // Hover numTotal -> Signal<number>
    const numLine = lines.findIndex(l => l.includes('numTotal()'));
    const numChar = lines[numLine].indexOf('numTotal');
    const numHover = service.getHover(uri, computedCode, { line: numLine, character: numChar });
    expect(numHover).not.toBeNull();
    expect(numHover?.contents).toContain('ComputedTestComponent.numTotal: Signal<number>');

    // Hover boolCheck -> Signal<boolean>
    const boolLine = lines.findIndex(l => l.includes('boolCheck()'));
    const boolChar = lines[boolLine].indexOf('boolCheck');
    const boolHover = service.getHover(uri, computedCode, { line: boolLine, character: boolChar });
    expect(boolHover).not.toBeNull();
    expect(boolHover?.contents).toContain('ComputedTestComponent.boolCheck: Signal<boolean>');

    // Hover strLabel -> Signal<string>
    const strLine = lines.findIndex(l => l.includes('strLabel()'));
    const strChar = lines[strLine].indexOf('strLabel');
    const strHover = service.getHover(uri, computedCode, { line: strLine, character: strChar });
    expect(strHover).not.toBeNull();
    expect(strHover?.contents).toContain('ComputedTestComponent.strLabel: Signal<string>');

    // 2. Real forms-demo.component.ts verification
    const formsDemoPath = path.resolve(
      __dirname,
      '../../../examples/playground/src/views/forms-demo.component.ts'
    );
    if (fs.existsSync(formsDemoPath)) {
      const formsDemoContent = fs.readFileSync(formsDemoPath, 'utf8');
      const formsDemoLines = formsDemoContent.split('\n');
      const grandTotalLine = formsDemoLines.findIndex(l => l.includes('grandTotal()'));
      const grandTotalChar = formsDemoLines[grandTotalLine].indexOf('grandTotal');

      const grandTotalHover = service.getHover(formsDemoPath, formsDemoContent, {
        line: grandTotalLine,
        character: grandTotalChar + 2,
      });
      expect(grandTotalHover).not.toBeNull();
      expect(grandTotalHover?.contents).toContain('FormsDemoComponent.grandTotal: Signal<number>');
    }
  });

  test('Feature 10: Member access autocompletions for FormControl, FormGroup, FormArray, and strings', () => {
    const service = new AngoraLanguageService();

    const testComponent = `
import { Component } from '@angora-js/core';
import { FormControl, FormGroup, FormArray, Validators } from '@angora-js/forms';

@Component({
  selector: 'app-test-completion',
  template: \`
    <div>
      <input [value]="customerControl." />
      <input (input)="customerControl.set" />
      <span>{{ orderForm. }}</span>
      <span>{{ orderForm.controls. }}</span>
      <span>{{ items. }}</span>
      <span>{{ customerControl.value(). }}</span>
      <span>{{ this. }}</span>
    </div>
  \`
})
export class TestCompletionComponent {
  customerControl = new FormControl('Alice', [Validators.required]);
  emailControl = new FormControl('alice@test.com', [Validators.required]);

  items = new FormArray([
    new FormControl('Item 1')
  ]);

  orderForm = new FormGroup({
    customer: this.customerControl,
    email: this.emailControl,
  });

  submit() {}
}
`;
    const uri = 'file:///workspace/src/test-completion.component.ts';
    const lines = testComponent.split('\n');

    // 1. Completion on customerControl.
    const custLine = lines.findIndex(l => l.includes('customerControl."'));
    const custChar = lines[custLine].indexOf('customerControl.') + 'customerControl.'.length;
    const custCompletions = service.getCompletions(uri, testComponent, {
      line: custLine,
      character: custChar,
    });

    // Properties and Signals
    expect(custCompletions.some(c => c.label === 'value()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'valid()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'dirty()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'touched()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'errors()')).toBe(true);

    // Methods
    expect(custCompletions.some(c => c.label === 'setValue()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'reset()')).toBe(true);
    expect(custCompletions.some(c => c.label === 'markAsTouched()')).toBe(true);

    // 2. Completion on customerControl.set
    const setLine = lines.findIndex(l => l.includes('customerControl.set'));
    const setChar = lines[setLine].indexOf('customerControl.set') + 'customerControl.set'.length;
    const setCompletions = service.getCompletions(uri, testComponent, {
      line: setLine,
      character: setChar,
    });
    expect(setCompletions.some(c => c.label === 'setValue()')).toBe(true);
    expect(setCompletions.every(c => c.label.toLowerCase().includes('set'))).toBe(true);

    // 3. Completion on orderForm.
    const formLine = lines.findIndex(l => l.includes('orderForm. }}'));
    const formChar = lines[formLine].indexOf('orderForm.') + 'orderForm.'.length;
    const formCompletions = service.getCompletions(uri, testComponent, {
      line: formLine,
      character: formChar,
    });
    expect(formCompletions.some(c => c.label === 'controls')).toBe(true);
    expect(formCompletions.some(c => c.label === 'valid()')).toBe(true);
    expect(formCompletions.some(c => c.label === 'reset()')).toBe(true);

    // 4. Completion on orderForm.controls.
    const controlsLine = lines.findIndex(l => l.includes('orderForm.controls. }}'));
    const controlsChar =
      lines[controlsLine].indexOf('orderForm.controls.') + 'orderForm.controls.'.length;
    const controlsCompletions = service.getCompletions(uri, testComponent, {
      line: controlsLine,
      character: controlsChar,
    });
    expect(controlsCompletions.some(c => c.label === 'customer')).toBe(true);
    expect(controlsCompletions.some(c => c.label === 'email')).toBe(true);

    // 5. Completion on items. (FormArray)
    const itemsLine = lines.findIndex(l => l.includes('items. }}'));
    const itemsChar = lines[itemsLine].indexOf('items.') + 'items.'.length;
    const itemsCompletions = service.getCompletions(uri, testComponent, {
      line: itemsLine,
      character: itemsChar,
    });
    expect(itemsCompletions.some(c => c.label === 'length()')).toBe(true);
    expect(itemsCompletions.some(c => c.label === 'push()')).toBe(true);
    expect(itemsCompletions.some(c => c.label === 'removeAt()')).toBe(true);

    // 6. Completion on customerControl.value(). (string)
    const strLine = lines.findIndex(l => l.includes('customerControl.value(). }}'));
    const strChar =
      lines[strLine].indexOf('customerControl.value().') + 'customerControl.value().'.length;
    const strCompletions = service.getCompletions(uri, testComponent, {
      line: strLine,
      character: strChar,
    });
    expect(strCompletions.some(c => c.label === 'length')).toBe(true);
    expect(strCompletions.some(c => c.label === 'trim()')).toBe(true);
    expect(strCompletions.some(c => c.label === 'toUpperCase()')).toBe(true);

    // 7. Completion on this.
    const thisLine = lines.findIndex(l => l.includes('this. }}'));
    const thisChar = lines[thisLine].indexOf('this.') + 'this.'.length;
    const thisCompletions = service.getCompletions(uri, testComponent, {
      line: thisLine,
      character: thisChar,
    });
    expect(thisCompletions.some(c => c.label === 'customerControl')).toBe(true);
    expect(thisCompletions.some(c => c.label === 'submit()')).toBe(true);
  }, 15000);

  test('Feature 11: Missing property or method access diagnostics (TS2339) across objects, classes, arrays, strings, and this', () => {
    const errorComponent = `import { Component } from '@angora-js/core';
import { FormControl, FormGroup, FormArray } from '@angora-js/forms';

interface UserProfile {
  id: number;
  username: string;
}

@Component({
  selector: 'app-error-test',
  template: \`
    <div>
      {{ customerControl.invalidMethod() }}
      {{ orderForm.nonExistentProp }}
      {{ orderForm.controls.nonExistentControl }}
      {{ items.badArrayMethod() }}
      {{ userControl.value().unknownUserField }}
      {{ customerControl.value().badStringMethod() }}
      {{ this.nonExistentComponentMethod() }}
    </div>
  \`
})
export class ErrorTestComponent {
  customerControl = new FormControl('Alice');
  orderForm = new FormGroup({
    customer: new FormControl(''),
    email: new FormControl('')
  });
  items = new FormArray<string>([]);
  userControl = new FormControl<UserProfile>({ id: 1, username: 'alice' });

  submit() {}
}
`;

    const uri = 'file:///workspace/src/error-test.component.ts';
    const diags = service.getDiagnostics(uri, errorComponent);

    // Should detect all 7 non-existent members with TS2339
    expect(diags.length).toBe(7);
    expect(diags.every(d => d.code === 'TS2339')).toBe(true);

    const messages = diags.map(d => d.message);
    expect(
      messages.some(m =>
        m.includes("Property 'invalidMethod' does not exist on type 'FormControl<string>'")
      )
    ).toBe(true);
    expect(
      messages.some(m =>
        m.includes("Property 'nonExistentProp' does not exist on type 'FormGroup'")
      )
    ).toBe(true);
    expect(
      messages.some(m =>
        m.includes("Property 'nonExistentControl' does not exist on type 'orderForm.controls'")
      )
    ).toBe(true);
    expect(
      messages.some(m =>
        m.includes("Property 'badArrayMethod' does not exist on type 'FormArray<string>'")
      )
    ).toBe(true);
    expect(
      messages.some(m =>
        m.includes("Property 'unknownUserField' does not exist on type 'UserProfile'")
      )
    ).toBe(true);
    expect(
      messages.some(m => m.includes("Property 'badStringMethod' does not exist on type 'String'"))
    ).toBe(true);
    expect(
      messages.some(m =>
        m.includes(
          "Property 'nonExistentComponentMethod' does not exist on type 'ErrorTestComponent'"
        )
      )
    ).toBe(true);

    // Verify that valid members have ZERO errors
    const validComponent = `import { Component } from '@angora-js/core';
import { FormControl, FormGroup, FormArray } from '@angora-js/forms';

interface UserProfile {
  id: number;
  username: string;
}

@Component({
  selector: 'app-valid-test',
  template: \`
    <div>
      <input [value]="customerControl.value()" (input)="customerControl.setValue($event.target.value)" />
      @if (customerControl.valid() && orderForm.dirty()) {
        <span>{{ customerControl.errors()?.required }}</span>
      }
      <span>{{ items.length() }}</span>
      <span>{{ userControl.value().username }}</span>
      <span>{{ customerControl.value().toUpperCase() }}</span>
      <button (click)="this.submit()">Submit</button>
    </div>
  \`
})
export class ValidTestComponent {
  customerControl = new FormControl('Alice');
  orderForm = new FormGroup({
    customer: new FormControl(''),
    email: new FormControl('')
  });
  items = new FormArray<string>([]);
  userControl = new FormControl<UserProfile>({ id: 1, username: 'alice' });

  submit() {}
}
`;
    const validDiags = service.getDiagnostics(
      'file:///workspace/src/valid-test.component.ts',
      validComponent
    );
    expect(validDiags.length).toBe(0);
  });

  test('Feature 6: should produce ZERO false errors on forms-demo.component.ts with emojis and form signals', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(
      __dirname,
      '../../../examples/playground/src/views/forms-demo.component.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    const diags = service.getDiagnostics('file://' + filePath, content);
    expect(diags.length).toBe(0);
  });

  test('Feature 6: should produce ZERO false errors on dashboard.component.ts with <app-todo-item> and TodoItemComponent', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(
      __dirname,
      '../../../examples/playground/src/views/dashboard.component.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    const diags = service.getDiagnostics('file://' + filePath, content);
    expect(diags.length).toBe(0);
  });

  test('Feature 12: Dynamic AST discovery from custom tsconfig.json paths and package.json workspaces without any hardcoded folders or packages', () => {
    const fs = require('fs');
    const path = require('path');
    const testDir = path.resolve(__dirname, '../../../target/test_dynamic_discovery');

    // Setup custom folder structure
    fs.mkdirSync(path.join(testDir, 'custom-libs/analytics'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'common-modules/logger'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'modules/billing-engine/src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });

    // 1. Custom tsconfig.json with non-standard paths
    fs.writeFileSync(
      path.join(testDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@my-corp/analytics': ['./custom-libs/analytics/index.ts'],
            '@shared-utils/*': ['./common-modules/*/entry.ts'],
          },
        },
      })
    );

    // 2. Custom package.json with non-standard workspace directory 'modules/*'
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'custom-app',
        workspaces: ['modules/*'],
      })
    );

    // 3. Source files
    fs.writeFileSync(
      path.join(testDir, 'custom-libs/analytics/index.ts'),
      `export class AnalyticsService {\n  trackEvent(name: string, payload: any): boolean { return true; }\n}`
    );
    fs.writeFileSync(
      path.join(testDir, 'common-modules/logger/entry.ts'),
      `export class LoggerService {\n  logInfo(msg: string): void {}\n}`
    );
    fs.writeFileSync(
      path.join(testDir, 'modules/billing-engine/package.json'),
      JSON.stringify({
        name: '@my-corp/billing',
        main: './src/billing.ts',
      })
    );
    fs.writeFileSync(
      path.join(testDir, 'modules/billing-engine/src/billing.ts'),
      `export class BillingService {\n  calculateTax(amount: number): number { return amount * 0.1; }\n}`
    );

    // 4. Test Component inside the custom workspace
    const compFile = path.join(testDir, 'src/dashboard.component.ts');
    const compContent = `import { Component } from '@angora-js/core';
import { AnalyticsService } from '@my-corp/analytics';
import { LoggerService } from '@shared-utils/logger';
import { BillingService } from '@my-corp/billing';

@Component({
  selector: 'app-dashboard',
  template: \`
    <div>
      <span>{{ analytics.trackEvent('page_view', {}) }}</span>
      <span>{{ logger.logInfo('ready') }}</span>
      <span>{{ billing.calculateTax(100) }}</span>
      <span>{{ analytics.nonExistentMethod() }}</span>
    </div>
  \`
})
export class DashboardComponent {
  analytics = new AnalyticsService();
  logger = new LoggerService();
  billing = new BillingService();
}
`;
    fs.writeFileSync(compFile, compContent);

    try {
      const compUri = 'file://' + compFile;
      const diags = service.getDiagnostics(compUri, compContent);

      // Only analytics.nonExistentMethod() should be an error!
      const ts2339Errors = diags.filter(d => d.code === 'TS2339');
      expect(ts2339Errors.length).toBe(1);
      expect(ts2339Errors[0].message).toContain(
        "Property 'nonExistentMethod' does not exist on type 'AnalyticsService'"
      );

      // Autocomplete on analytics. should suggest trackEvent
      const lines = compContent.split('\n');
      const lineIdx = lines.findIndex(l => l.includes('analytics.trackEvent'));
      const charIdx = lines[lineIdx].indexOf('analytics.') + 'analytics.'.length;
      const completions = service.getCompletions(compUri, compContent, {
        line: lineIdx,
        character: charIdx,
      });
      expect(completions.some(c => c.label.includes('trackEvent'))).toBe(true);

      // Hover on billing.calculateTax should resolve BillingService
      const billingChar = lines[lineIdx + 2].indexOf('billing');
      const billingHover = service.getHover(compUri, compContent, {
        line: lineIdx + 2,
        character: billingChar,
      });
      expect(billingHover?.contents).toContain('BillingService');
    } finally {
      // Clean up temporary test files
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('Feature 13: Signal methods (.set, .update, .asReadonly) in templates must work on WritableSignals without TS2339 false positives, while computed() signals remain read-only', () => {
    const signalSource = `import { Component, signal, computed } from '@angora-js/core';

@Component({
  selector: 'app-signal-demo',
  template: \`
    <div>
      <button (click)="isOpen.set(!isOpen())">Toggle</button>
      <button (click)="count.update(n => n + 1)">Increment</button>
      <button (click)="readOnlyDouble.set(99)">Invalid</button>
    </div>
  \`
})
export class SignalDemoComponent {
  isOpen = signal(false);
  count = signal(0);
  readOnlyDouble = computed(() => this.count() * 2);
}
`;

    const uri = 'file:///workspace/src/signal-demo.component.ts';
    const diags = service.getDiagnostics(uri, signalSource);

    // isOpen.set and count.update must NOT produce TS2339 errors
    const isOpenErrors = diags.filter(
      d => d.message.includes("'set'") && d.message.includes('isOpen')
    );
    expect(isOpenErrors.length).toBe(0);

    const countErrors = diags.filter(
      d => d.message.includes("'update'") && d.message.includes('count')
    );
    expect(countErrors.length).toBe(0);

    // readOnlyDouble.set must produce TS2339 because computed() is read-only
    const readOnlyErrors = diags.filter(d => d.code === 'TS2339' && d.message.includes("'set'"));
    expect(readOnlyErrors.length).toBe(1);
    expect(readOnlyErrors[0].message).toContain(
      "Property 'set' does not exist on type 'Signal<number>'"
    );
  });
});
