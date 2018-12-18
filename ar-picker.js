import { LitElement, html } from "@polymer/lit-element"; 
import { repeat } from "lit-html/directives/repeat";
import { style } from "./ar-picker-css";
import { bezier } from "bezier-easing";

const ITEM_HEIGHT = 36;

/**
 * `<ar-picker>` is a minimal cupertino style picker which allows user to pick 
 * an item from the list.
 * 
 * @customElement
 * @polymer
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
        this._scrollTop = 0;

        this.animationDuration = 180;
        this.bezierCurve = [0.785, 0.135, 0.15, 0.86];
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
                }

                #container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow-x: hidden;
                    overflow-y: hidden;
                }

                #container .whitespace {
                    height: calc(50% - 36px / 2);
                    flex-shrink: 0;
                }

                #selection-marker {
                    position: absolute;
                    top: 50%;
                    width: 100%;
                }

                .item {
                    box-sizing: border-box;
                    min-height: 36px;
                    height: 36px;
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
            <div id="selection-marker"><hr style="margin: 0" /></div>
        `;
    }

    renderItem(item, index) {
        return html`<div class="item" @click=${this._onItemClick} .data-value=${item}>${item}</div>`;
    }

    stopAnimation() {
        this._pendingScroll = 0;
        this._lastTimestamp = null;
        this._animating = false;
    };

    animatePhysics(now) {
        if (!this._lastTimestamp) {
            // setup timestamp and wait until next frame
            this._lastTimestamp = now;
            this._animating = true;
            return requestAnimationFrame(this.animatePhysics.bind(this));
        }
        
        const container = this.shadowRoot.querySelector("#container");
        const wheel = this.shadowRoot.querySelector("#wheel");

        const delta = now - this._lastTimestamp;

        // sentinel checks
        if (Math.round(this._pendingScroll) === 0
            || this._scrollTop === 0 && this._pendingScroll < 0
            || this._scrollTop + container.offsetHeight >= wheel.offsetHeight && this._pendingScroll > 0) {
            return this.stopAnimation();
        }

        // Measures the offset distance from previous stable position. 
        let scrollOffset = this._pendingScroll > 0
            ? (ITEM_HEIGHT + this._scrollTop) % ITEM_HEIGHT
            : (ITEM_HEIGHT - this._scrollTop % ITEM_HEIGHT) % ITEM_HEIGHT;

        // defense mechanism
        if (scrollOffset < 0) {
            console.error("Not supposed to happen. One of the sentinel checks should have catched this.", {
                scrollOffset,
                _pendingScroll: this._pendingScroll,
                _scrollTop: this._scrollTop,
            });

            scrollOffset = 0;
        }

        // shrink animation time based on force applied
        const shrunkenAnimationTime = Math.min(this.animationDuration, this.animationDuration * ITEM_HEIGHT / Math.abs(this._pendingScroll));

        // calculate total time taken for given scroll offset
        const t = this.inverseEasingFunction(scrollOffset / ITEM_HEIGHT) * shrunkenAnimationTime;

        // differential distance for given delta
        let dx = this.easingFunction(Math.min(1, (t + delta) / shrunkenAnimationTime)) * ITEM_HEIGHT 
            - this.easingFunction(Math.min(1, t / shrunkenAnimationTime)) * ITEM_HEIGHT;

        // apply maximum limits
        dx = Math.sign(this._pendingScroll) * Math.min(Math.abs(this._pendingScroll), dx);

        // animate scroll
        this._scrollTop = Math.max(0, Math.min(wheel.offsetHeight, this._scrollTop + dx));
        this.shadowRoot.querySelector("#wheel").style.transform = `translateY(${-this._scrollTop}px)`;

        // compute animation params for next frame
        this._pendingScroll -= dx;
        this._lastTimestamp = now;
        
        if (this.checkForStability()) {
            return this.stopAnimation();
        }

        requestAnimationFrame(this.animatePhysics.bind(this));
    }

    checkForStability() {
        const container = this.shadowRoot.querySelector("#container");

        if (Math.round(this._pendingScroll) === 0) {
            if (this._scrollTop % ITEM_HEIGHT === 0) {
                // current position is stable
                const selectedIndex = Math.round(this._scrollTop / ITEM_HEIGHT);
                
                if (this._selectedItem !== this.items[selectedIndex]) {
                    this._selectedItem = this.items[selectedIndex];

                    this.dispatchEvent(new CustomEvent("select", {
                        detail: {
                            selected: this._selectedItem
                        }
                    }));
                }

                return true;
            }

            if (this.trackedTouch || this.externalForce) {
                // external force stabilizing current position
                return true;
            }

            if (this._scrollTop % ITEM_HEIGHT > ITEM_HEIGHT / 2) {
                this._pendingScroll = ITEM_HEIGHT - this._scrollTop % ITEM_HEIGHT;
            } else {
                this._pendingScroll = -(this._scrollTop % ITEM_HEIGHT);
            }
        }

        return false;
    }

    _getSelectedIndex() {
        const container = this.shadowRoot.querySelector("#container");
        return Math.round(this._scrollTop / ITEM_HEIGHT);
    }

    _onItemClick(event) {
        const whitespaceElement = this.shadowRoot.querySelector(".whitespace.start");
        const container = this.shadowRoot.querySelector("#container");
        const clickedItem = event.path[0].closest("div.item");

        this._pendingScroll += clickedItem.offsetTop - (this._scrollTop + whitespaceElement.offsetTop 
            + whitespaceElement.offsetHeight);
        this._animating || requestAnimationFrame(this.animatePhysics.bind(this));

        this.dispatchEvent(new CustomEvent("item-click", {
            detail: {
                item: clickedItem["data-value"]
            }
        }));
    }

    _onKeyDown(event) {
        if (event.key === "ArrowUp") {
            this._pendingScroll -= ITEM_HEIGHT;
            this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
        } else if (event.key === "ArrowDown") {
            this._pendingScroll += ITEM_HEIGHT;
            this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
        }
    }

    _onTouchStart(event) {
        this.trackedTouch = event.targetTouches[0];
    }

    _onTouchEnd(event) {
        if (this.trackedTouch && Array.from(event.changedTouches).find(touch => touch.identifier === this.trackedTouch.identifier)) {
            this.trackedTouch = null;

            if (!this.checkForStability()) {
                this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
            }
        }
    }

    _onTouchMove(event) {
        const currentTouch = this.trackedTouch && Array.from(event.changedTouches).find(touch => touch.identifier === this.trackedTouch.identifier);

        if (currentTouch) {
            this._pendingScroll += this.trackedTouch.screenY - currentTouch.screenY;
            this._animating || requestAnimationFrame(this.animatePhysics.bind(this));

            this.trackedTouch = currentTouch;
        }
    }

    _onWheelHandler(event) {
        const smoothScroll = event.deltaY === Math.round(event.deltaY);

        if (!smoothScroll) {
            // assuming trackpad scroll
            this.externalForce = true;
            
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            
            this._debounceTimer = setTimeout(() => {
                this.externalForce = false;
                this._debounceTimer = null;
                if(!this.checkForStability()) {
                    this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
                }
            }, 500);
            
            this._pendingScroll += event.deltaY;
            this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
        } else {
            // assuming mousewheel scroll
            this._pendingScroll += Math.floor(event.deltaY / ITEM_HEIGHT) * ITEM_HEIGHT;
            this._animating || requestAnimationFrame(this.animatePhysics.bind(this));
        }
    }
}

customElements.define('ar-picker', Picker);
