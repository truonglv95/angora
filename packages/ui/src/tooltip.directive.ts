import { Directive, ElementRef, input, inject } from '@angora-js/core';

@Directive({
  selector: '[angoraTooltip]',
})
export class TooltipDirective {
  private el = inject(ElementRef).nativeElement as HTMLElement;
  public content = input<string>('', { alias: 'angoraTooltip' });

  private tooltipEl?: HTMLElement;

  constructor() {
    this.el.addEventListener('mouseenter', () => this.show());
    this.el.addEventListener('mouseleave', () => this.hide());
    this.el.addEventListener('focus', () => this.show());
    this.el.addEventListener('blur', () => this.hide());
  }

  show() {
    const text = this.content();
    if (!text || this.tooltipEl) return;

    const tip = document.createElement('div');
    tip.className = 'angora-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    tip.style.position = 'absolute';
    tip.style.zIndex = '1070';
    tip.style.padding = '4px 8px';
    tip.style.borderRadius = '4px';
    tip.style.fontSize = '12px';
    tip.style.color = '#fff';
    tip.style.background = 'rgba(0, 0, 0, 0.85)';
    tip.style.pointerEvents = 'none';

    document.body.appendChild(tip);
    this.tooltipEl = tip;

    const rect = this.el.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2 - tip.offsetWidth / 2}px`;
    tip.style.top = `${rect.top - tip.offsetHeight - 6}px`;
  }

  hide() {
    if (this.tooltipEl) {
      if (this.tooltipEl.parentNode) {
        this.tooltipEl.parentNode.removeChild(this.tooltipEl);
      }
      this.tooltipEl = undefined;
    }
  }

  angoraOnDestroy() {
    this.hide();
  }
}
