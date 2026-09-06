import { Component, signal, computed, inject } from '@angora-js/core';
import {
  FormGroup,
  FormControl,
  FormArray,
  Validators,
  type AsyncValidatorFn,
} from '@angora-js/forms';
import { ToastService } from '@angora-js/ui';

// Asynchronous Promo Code Validator simulating server verification
const promoCodeAsyncValidator: AsyncValidatorFn = (controlOrVal: any) => {
  const raw =
    typeof controlOrVal === 'object' && controlOrVal && 'value' in controlOrVal
      ? typeof controlOrVal.value === 'function'
        ? controlOrVal.value()
        : controlOrVal.value
      : controlOrVal;
  const code = (raw || '').trim().toUpperCase();
  if (!code) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    setTimeout(() => {
      if (code === 'ANGORA20' || code === 'SAVE50' || code === 'DEVMEET') {
        resolve(null); // Valid coupon
      } else {
        resolve({ invalidPromo: 'Invalid coupon code. Try "ANGORA20"' });
      }
    }, 400);
  });
};

function createItemRow(name = 'Design Tokens Suite', qty = 1, price = 49) {
  return new FormGroup({
    name: new FormControl(name, [Validators.required]),
    quantity: new FormControl(qty, [Validators.required, Validators.min(1)]),
    unitPrice: new FormControl(price, [Validators.required, Validators.min(0)]),
  });
}

@Component({
  selector: 'app-forms-demo',
  template: `
    <div class="forms-demo-view">
      <!-- Section Header -->
      <div
        class="panel-card"
        style="background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(79,70,229,0.08) 100%);"
      >
        <h1 style="margin: 0 0 0.5rem 0; font-size: 1.75rem; color: var(--angora-primary);">
          📋 Enterprise Reactive Forms & FormArray
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Fine-grained signal-driven forms with hierarchical validation, dynamic FormArray rows,
          real-time totals, and race-condition-free async validators.
        </p>
      </div>

      <!-- Form Status Signals -->
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">Form Status</span>
          <span class="stat-value">
            @if (orderForm.status() === 'VALID') {
              <span class="badge badge-success">VALID</span>
            } @else if (orderForm.status() === 'PENDING') {
              <span class="badge badge-warning">VALIDATING...</span>
            } @else {
              <span class="badge badge-danger">INVALID</span>
            }
          </span>
          <span class="form-hint">Aggregated from all child controls</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Items in FormArray</span>
          <span class="stat-value" style="color: var(--angora-primary);">{{ items.length() }}</span>
          <span class="form-hint">Dynamic signal length()</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Grand Total</span>
          <span class="stat-value" style="color: var(--angora-success);"
            ><span>$</span>{{ grandTotal() }}</span
          >
          <span class="form-hint">Includes live discount & tax</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Interaction State</span>
          <div style="display: flex; gap: 0.35rem; margin-top: 0.5rem;">
            <span class="badge {{ orderForm.dirty() ? 'badge-warning' : 'badge-info' }}">
              {{ orderForm.dirty() ? 'DIRTY' : 'PRISTINE' }}
            </span>
            <span class="badge {{ orderForm.touched() ? 'badge-warning' : 'badge-info' }}">
              {{ orderForm.touched() ? 'TOUCHED' : 'UNTOUCHED' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Order Form Card -->
      <div class="panel-card">
        <h3 style="margin-top: 0;">Customer Information</h3>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Customer Name *</label>
            <input
              class="input-control"
              [value]="customerControl.value()"
              (input)="customerControl.setValue($event.target.value)"
              (blur)="customerControl.markAsTouched()"
              placeholder="e.g. John Doe"
            />
            @if (customerControl.touched() && customerControl.errors()?.required) {
              <span class="form-error">Customer name is required.</span>
            }
          </div>

          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input
              class="input-control"
              type="email"
              [value]="emailControl.value()"
              (input)="emailControl.setValue($event.target.value)"
              (blur)="emailControl.markAsTouched()"
              placeholder="e.g. john@angora.dev"
            />
            @if (emailControl.touched() && emailControl.errors()?.required) {
              <span class="form-error">Email is required.</span>
            }
            @if (emailControl.touched() && emailControl.errors()?.email) {
              <span class="form-error">Please enter a valid email.</span>
            }
          </div>
        </div>

        <hr
          style="border: 0; border-top: 1px solid var(--angora-border-color); margin: 1.5rem 0;"
        />

        <div
          style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"
        >
          <h3 style="margin: 0;">Invoice Line Items (Dynamic FormArray)</h3>
          <button class="btn btn-secondary" (click)="addItemRow()">+ Add Row</button>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 45%;">Item Description</th>
              <th style="width: 20%;">Qty</th>
              <th style="width: 20%;">Price ($)</th>
              <th style="width: 15%; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (row of items.controls(); track $index) {
              <tr>
                <td>
                  <input
                    class="input-control"
                    [value]="row.controls.name.value()"
                    (input)="updateItemField(row.controls.name, $event.target.value)"
                    placeholder="Product / Service"
                  />
                </td>
                <td>
                  <input
                    class="input-control"
                    type="number"
                    min="1"
                    [value]="row.controls.quantity.value()"
                    (input)="updateItemField(row.controls.quantity, Number($event.target.value))"
                  />
                </td>
                <td>
                  <input
                    class="input-control"
                    type="number"
                    min="0"
                    step="0.01"
                    [value]="row.controls.unitPrice.value()"
                    (input)="updateItemField(row.controls.unitPrice, Number($event.target.value))"
                  />
                </td>
                <td style="text-align: right;">
                  <button
                    class="btn btn-danger"
                    style="padding: 0.25rem 0.5rem;"
                    (click)="removeItemRow($index)"
                  >
                    &times; Delete
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>

        <hr
          style="border: 0; border-top: 1px solid var(--angora-border-color); margin: 1.5rem 0;"
        />

        <!-- Async Coupon Code Validation -->
        <h3 style="margin-top: 0;">Async Server Coupon Verification</h3>
        <div class="form-row">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label class="form-label">Coupon Code (Try "ANGORA20" or "SAVE50")</label>
            <input
              class="input-control"
              [value]="couponControl.value()"
              (input)="couponControl.setValue($event.target.value)"
              (blur)="couponControl.markAsTouched()"
              placeholder="e.g. ANGORA20"
            />
          </div>
          <div>
            @if (couponControl.status() === 'PENDING') {
              <span class="badge badge-warning" style="padding: 0.5rem 0.75rem;">
                ⏳ Checking with server...
              </span>
            } @else if (couponControl.valid() && couponControl.value()) {
              <span class="badge badge-success" style="padding: 0.5rem 0.75rem;">
                ✅ Coupon Applied (-20%)
              </span>
            } @else if (couponControl.errors()?.invalidPromo) {
              <span class="badge badge-danger" style="padding: 0.5rem 0.75rem;">
                ❌ {{ couponControl.errors()?.invalidPromo }}
              </span>
            }
          </div>
        </div>

        <!-- Form Actions -->
        <div style="display: flex; gap: 1rem; margin-top: 2rem; justify-content: flex-end;">
          <button class="btn btn-secondary" (click)="resetForm()">Reset Form</button>
          <button class="btn btn-primary" (click)="submitOrder()">
            Submit Order ($<span>{{ grandTotal() }}</span
            >)
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FormsDemoComponent {
  toastService = inject(ToastService);

  customerControl = new FormControl('Alice Wonderland', [Validators.required]);
  emailControl = new FormControl('alice@angora.dev', [Validators.required, Validators.email]);
  couponControl = new FormControl('', [], [promoCodeAsyncValidator]);

  items = new FormArray([
    createItemRow('Angular-to-Go High Speed Compiler', 1, 199),
    createItemRow('Angora UI Enterprise SCSS Tokens', 2, 49),
  ]);

  orderForm = new FormGroup({
    customer: this.customerControl,
    email: this.emailControl,
    coupon: this.couponControl,
    items: this.items,
  });

  // Real-time calculated grand total
  grandTotal = computed(() => {
    let subtotal = 0;
    const rows = this.items.controls();
    for (const row of rows) {
      const q = Number(row.controls.quantity.value()) || 0;
      const p = Number(row.controls.unitPrice.value()) || 0;
      subtotal += q * p;
    }

    // Check if coupon is valid
    if (this.couponControl.valid() && this.couponControl.value()) {
      const code = this.couponControl.value().trim().toUpperCase();
      if (code === 'ANGORA20') subtotal *= 0.8;
      if (code === 'SAVE50') subtotal *= 0.5;
    }

    return parseFloat(subtotal.toFixed(2));
  });

  addItemRow() {
    this.items.push(createItemRow('New Cloud Service', 1, 39));
  }

  removeItemRow(index: number) {
    if (this.items.length() > 1) {
      this.items.removeAt(index);
    } else {
      this.toastService.warning('An invoice requires at least 1 item.');
    }
  }

  updateItemField(control: any, val: any) {
    control.setValue(val);
  }

  resetForm() {
    this.orderForm.reset({
      customer: 'Alice Wonderland',
      email: 'alice@angora.dev',
      coupon: '',
    });
    this.items.clear();
    this.items.push(createItemRow('Angular-to-Go High Speed Compiler', 1, 199));
    this.toastService.info('Form has been reset to defaults.');
  }

  submitOrder() {
    if (this.orderForm.invalid()) {
      this.orderForm.markAllAsTouched();
      this.toastService.error('Please fix validation errors before submitting.');
      return;
    }

    this.toastService.success(
      `Order submitted successfully for ${this.customerControl.value()}! Total: $${this.grandTotal()}`
    );
  }
}
