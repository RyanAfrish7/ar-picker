import { LitElement, html } from "@polymer/lit-element"; 
import { repeat } from "lit-html/directives/repeat";
import { bezier } from "bezier-easing";

import { style } from "./ar-picker-css";

const ITEM_HEIGHT = 24;
const EFFECTIVELY_ZERO = 1e-10;

const approxEq = (value1, value2, delta = EFFECTIVELY_ZERO) => Math.abs(value1 - value2) <= delta;

/**
 * `<ar-picker>` is a minimal cupertino style picker which allows user to pick 
 * an item from the list.
 * 
 * @customElement
 * @polymer
 * @extends HTMLElement
 * 
 */
class Picker extends LitElement {
    static get properties() {
        return {
            /**
             * Time taken (in milliseconds) for scrolling between two stable positions.
             * This may get shrunken down when scrolled with higher energies. 
             */
            animationDuration: { type: Number, reflect: true, hasChanged: () => false },

            /**
             * List of items to be displayed in the wheel 
             */
            items: { type: Array },

            /** 
             * The last selected item. 
             * WARNING: The wheel may be animating. Prefer using events to obtain the selected item.
             */
            _selectedItem: { type: Object },
        };
    }

    constructor() {
        super();

        this._pendingScroll = 0;
        this._currentScroll = 0;
        this._is_isExternalForceActiveActive = false;

        this.animationDuration = 180;
        this.bezierCurve = [0.785, 0.135, 0.15, 0.86];
        this._animatePhysics = this._animatePhysics.bind(this);
    }

    /** 
     * Array of numbers. 
     * [x1, y1, x2, y2] where (x1, y1) and (x2, y2) are control points which forms convex hull of the curve. 
     */
    set bezierCurve(value) {
        const generateEasingFunctions = (x1, y1, x2, y2) => [
            bezier(x1, y1, x2, y2), bezier(y1, x1, y2, x2)
        ];

        [this.easingFunction, this.inverseEasingFunction] = generateEasingFunctions(...value);
    }

    get _selectedIndex() {
        return Math.round(this._currentScroll / ITEM_HEIGHT);
    }

    renderStyle() {
        return style;
    }

    render() {
        return html`
            ${this.renderStyle()}
            <style>
                :host {
                    display: block;
                    position: relative;
                    touch-action: none;
                    --item-height: ${ITEM_HEIGHT}px;
                }

                #container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow-x: hidden;
                    overflow-y: hidden;
                    -webkit-font-smoothing: antialiased;
                }

                #container .whitespace {
                    height: calc(50% - var(--item-height) / 2);
                    flex-shrink: 0;
                }

                #selection-marker {
                    pointer-events: none;
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 100%;
                }

                #selection-marker hr {
                    margin: 0;
                }

                .item {
                    box-sizing: border-box;
                    min-height: var(--item-height);
                    height: var(--item-height);
                }
            </style>
            <div id="container"
                @wheel=${{ handleEvent: this._onWheelHandler.bind(this), passive: true }} 
                @touchstart=${{ handleEvent: this._onTouchStart.bind(this), passive: true }}
                @touchend=${{ handleEvent: this._onTouchEnd.bind(this), passive: true }}
                @touchmove=${{ handleEvent: this._onTouchMove.bind(this), passive: true }}
                @keydown=${{ handleEvent: this._onKeyDown.bind(this), passive: true }}
                tabindex="-1">
                <div id="wheel">
                    <div class="whitespace start"></div>
                    ${repeat(this.items, this.renderItem.bind(this))}
                    <div class="whitespace end"></div>
                </div>
            </div>
            <div id="selection-marker">
                <slot name="selection-marker">
                    <hr />
                    <div style="height: calc(var(--item-height) * 1.4)"></div>
                    <hr />
                </slot>
            </div>
        `;
    }

    renderItem(item, index) {
        return html`<div class="item" @click=${this._onItemClick} .data-value=${item}>${item}</div>`;
    }

    updated() {
        this._applyPhysics();
    }

    _stopAnimation() {
        this._pendingScroll = 0;
        this._lastTimestamp = null;

        this._animating && cancelAnimationFrame(this._animating);
        return this._animating = null;
    };

    _startPhysicsAnimation() {
        this._animating || requestAnimationFrame(this._animatePhysics);
    }

    _animatePhysics(now) {
        if (!this._lastTimestamp) {
            // setup timestamp and wait until next frame
            this._lastTimestamp = now;
            return this._animating = requestAnimationFrame(this._animatePhysics);
        }

        const container = this.shadowRoot.querySelector("#container");
        const wheel = this.shadowRoot.querySelector("#wheel");

        // sentinel checks
        if (this._currentScroll === 0 && this._pendingScroll < 0
            || this._currentScroll + container.offsetHeight >= wheel.offsetHeight && this._pendingScroll > 0) {
            // hard absorption of any remaining force. TODO momentum scrolling
            this._pendingScroll = 0;
        }
        
        // stability check
        if (approxEq(this._pendingScroll, 0)) {
            if (this._isWheelStable()) {
                return this._onWheelStable();
            } else {
                this._stabilizeWheel();
                this._lastTimestamp = now;
                return this._animating = requestAnimationFrame(this._animatePhysics);
            }
        }

        const delta = now - this._lastTimestamp;

        // Measures the offset distance from previous stable position. 
        let scrollOffset = this._pendingScroll > 0
            ? (ITEM_HEIGHT + this._currentScroll) % ITEM_HEIGHT
            : (ITEM_HEIGHT - this._currentScroll % ITEM_HEIGHT) % ITEM_HEIGHT;

        // defense mechanism
        if (scrollOffset < 0) {
            console.error("Not supposed to happen. One of the sentinel checks should have catched this.", {
                scrollOffset,
                _pendingScroll: this._pendingScroll,
                _currentScroll: this._currentScroll,
                delta,
                _lastTimestamp: this._lastTimestamp,
                now
            });

            scrollOffset = 0;
        }

        // shrink animation time based on force applied
        const shrunkenAnimationTime = Math.min(this.animationDuration, this.animationDuration * ITEM_HEIGHT / Math.abs(this._pendingScroll));

        // estimate time taken for scroll offset
        const t = this.inverseEasingFunction(scrollOffset / ITEM_HEIGHT) * shrunkenAnimationTime;

        // differential distance for given delta
        let dx = this.easingFunction(Math.min(1, (t + delta) / shrunkenAnimationTime)) * ITEM_HEIGHT 
            - this.easingFunction(Math.min(1, t / shrunkenAnimationTime)) * ITEM_HEIGHT;

        // apply maximum limits
        dx = Math.sign(this._pendingScroll) * Math.min(Math.abs(this._pendingScroll), dx);

        // animate scroll
        this._currentScroll = Math.max(0, Math.min(wheel.offsetHeight, this._currentScroll + dx));
        if (approxEq(this._currentScroll, Math.round(this._currentScroll))) {
            this._currentScroll = Math.round(this._currentScroll);
        }

        this._applyPhysics();

        // compute animation params for next frame
        this._pendingScroll -= dx;
        this._lastTimestamp = now;
        
        return this._animating = requestAnimationFrame(this._animatePhysics);
    }

    _applyPhysics() {
        const container = this.shadowRoot.querySelector("#container");
        
        this.shadowRoot.querySelectorAll("#container .item").forEach((item, i) => {
            let angle = 0;
            let dy = -this._currentScroll;
            let scale = 1;

            if (Math.abs(i * ITEM_HEIGHT - this._currentScroll) < container.offsetHeight / 2) {
                angle = (i * ITEM_HEIGHT - this._currentScroll) / (container.offsetHeight / 2) * Math.PI / 2;
                dy =  (container.offsetHeight / 2) * Math.sin(angle) - i * ITEM_HEIGHT;
                scale = 1 + 0.4 * (1 - Math.abs(angle / Math.PI * 2));
                
                item.classList.toggle("selected", Math.abs(i * ITEM_HEIGHT - this._currentScroll) < ITEM_HEIGHT / 2);
            }

            item.style.transform = `translateY(${dy}px) rotateX(${angle}rad) scale(${scale})`;
        });
    }

    _isWheelStable() {
        if (approxEq(this._pendingScroll, 0)) {
            this._pendingScroll = 0;

            return approxEq(this._currentScroll % ITEM_HEIGHT, 0) // is current position stable
                || this._isExternalForceActive;
        }
        
        return false;
    }

    _onWheelStable() {
        const selectedIndex = this._selectedIndex;

        if (!this._isExternalForceActive && this._selectedItem !== this.items[selectedIndex]) {
            this._selectedItem = this.items[selectedIndex];

            this.dispatchEvent(new CustomEvent("select", {
                detail: { selected: this._selectedItem }
            }));
        }

        return this._stopAnimation();
    }

    _stabilizeWheel() {
        if (this._currentScroll % ITEM_HEIGHT > ITEM_HEIGHT / 2) {
            this._pendingScroll = ITEM_HEIGHT - this._currentScroll % ITEM_HEIGHT;
        } else {
            this._pendingScroll = -(this._currentScroll % ITEM_HEIGHT);
        }

        this._startPhysicsAnimation();
    }

    _onItemClick(event) {
        const whitespaceElement = this.shadowRoot.querySelector(".whitespace.start");
        const clickedItem = event.path[0].closest("div.item");

        this._pendingScroll += clickedItem.offsetTop - (this._currentScroll + whitespaceElement.offsetTop + whitespaceElement.offsetHeight);
        this._startPhysicsAnimation();

        this.dispatchEvent(new CustomEvent("select", {
            detail: {
                selected: clickedItem["data-value"]
            }
        }));
    }

    _onKeyDown(event) {
        if (event.key === "ArrowUp") {
            this._pendingScroll -= ITEM_HEIGHT;
            this._startPhysicsAnimation();
        } else if (event.key === "ArrowDown") {
            this._pendingScroll += ITEM_HEIGHT;
            this._startPhysicsAnimation();
        }
    }

    _onTouchStart(event) {
        if (!this.trackedTouch) {
            this.trackedTouch = event.changedTouches[0];
            this._isExternalForceActive = true;
        }
    }

    _onTouchEnd(event) {
        if (this.trackedTouch && Array.from(event.changedTouches).find(touch => touch.identifier === this.trackedTouch.identifier)) {
            this.trackedTouch = null;
            this._isExternalForceActive = false;

            this._startPhysicsAnimation();
        }
    }

    _onTouchMove(event) {
        const currentTouch = this.trackedTouch && Array.from(event.changedTouches).find(touch => touch.identifier === this.trackedTouch.identifier);

        if (currentTouch) {
            this._pendingScroll += this.trackedTouch.screenY - currentTouch.screenY;
            this._startPhysicsAnimation();

            this.trackedTouch = currentTouch;
        }
    }

    _onWheelHandler(event) {
        const smoothScroll = event.deltaY === Math.round(event.deltaY);

        if (!smoothScroll) {
            // assuming trackpad scroll
            this._isExternalForceActive = true;
            
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            
            this._debounceTimer = setTimeout(() => {
                this._isExternalForceActive = false;
                this._debounceTimer = null;
                if(!this._isWheelStable()) {
                    this._stabilizeWheel();
                }
            }, 600);
            
            this._pendingScroll += event.deltaY;
            this._startPhysicsAnimation();
        } else {
            // assuming mousewheel scroll
            this._pendingScroll += Math.floor(event.deltaY / ITEM_HEIGHT) * ITEM_HEIGHT;
            this._startPhysicsAnimation();
        }
    }
}

customElements.define('ar-picker', Picker);
