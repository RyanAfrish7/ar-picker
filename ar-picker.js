import { LitElement, html } from "@polymer/lit-element"; 
import { repeat } from "lit-html/directives/repeat";
import { style } from "./ar-picker-css";
import { bezier } from "bezier-easing";

const ITEM_HEIGHT = 36;
const ANIMATION_TIME = 180;

/**
* @polymer
* @extends HTMLElement
*/
class Picker extends LitElement {
    static get properties() {
        return {
            items: { type: Array },
        };
    }

    constructor() {
        super();

        this._pendingScroll = 0;
        this._floatCorrection = 0;

        [this.easingFunction, this.inverseEasingFunction] = ((x1, y1, x2, y2) => [bezier(x1, y1, x2, y2), bezier(y1, x1, y2, x2)])(1, 0, 0.4, 0.6);
        // this.easingFunction = bezier(0.5, 0.5, 0.5, 0.5);
        // this.inverseEasingFunction = bezier(0.5, 0.5, 0.5, 0.5);
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
                <div class="whitespace"></div>
                ${repeat(this.items, this.renderItem.bind(this))}
                <div class="whitespace"></div>
            </div>
            <div id="selection-marker"><hr style="margin: 0" /></div>
        `;
    }

    renderItem(item) {
        return html`<div class="item">${item}</div>`;
    }

    resetAnimation() {
        this._pendingScroll = 0;
        this._lastTimestamp = null;
        this._floatCorrection = 0;
        this._animating = false;
    };

    animatePhysics(now) {
        if (!now) {
            // setup timestamp and wait until next frame
            this._animating = true;
            this._lastTimestamp = now;
            return requestAnimationFrame(this.animatePhysics.bind(this));
        }
        
        const container = this.shadowRoot.querySelector("#container");
        const delta = now - this._lastTimestamp;

        this._lastTimestamp = now;

        // sentinel checks
        if (Math.round(this._pendingScroll) === 0 
            || container.scrollTop === 0 && this._pendingScroll <= 0
            || container.scrollTop + container.offsetHeight >= container.scrollHeight) {
            return this.resetAnimation();
        }

        // Measures the offset distance from previous stable position. 
        const scrollOffset = this._pendingScroll > 0
            ? container.scrollTop % ITEM_HEIGHT + this._floatCorrection
            : (ITEM_HEIGHT - container.scrollTop % ITEM_HEIGHT) % ITEM_HEIGHT - this._floatCorrection;

        // defensive check
        if (scrollOffset < 0) {
            console.error("Not supposed to happen. One of the sentinel checks should have catched this. Resetting animation.", {
                scrollOffset,
                _pendingScroll: this._pendingScroll,
                _floatCorrection: this._floatCorrection
            });

            return this.resetAnimation();
        }

        // calculate total time taken for given scroll offset
        const t = this.inverseEasingFunction(scrollOffset / ITEM_HEIGHT) * ANIMATION_TIME;

        // differential distance for given delta
        let dx = this.easingFunction(Math.min(1, (t + delta) / ANIMATION_TIME)) * ITEM_HEIGHT 
            - this.easingFunction(Math.min(1, t / ANIMATION_TIME)) * ITEM_HEIGHT;

            
        // apply maximum limits
        dx = Math.sign(this._pendingScroll) * Math.min(Math.abs(this._pendingScroll), dx) + this._floatCorrection;

        // animate scroll
        container.scrollTop += Math.round(dx);

        // compute animation params for next frame if any
        this._floatCorrection = dx - Math.round(dx);
        this._pendingScroll -= Math.round(dx);

        // capture any float precision errors
        if(Math.abs(this._floatCorrection) < 1e-10) {
            this._floatCorrection = 0;
        }
        
        if (this.checkForStability()) {
            return this.resetAnimation();
        }

        requestAnimationFrame(this.animatePhysics.bind(this));
    }

    checkForStability() {
        const container = this.shadowRoot.querySelector("#container");

        if (Math.round(this._pendingScroll) === 0) {
            if (container.scrollTop % ITEM_HEIGHT === 0) {
                return true;
            } else if(container.scrollTop % ITEM_HEIGHT > ITEM_HEIGHT / 2) {
                this._pendingScroll = ITEM_HEIGHT - container.scrollTop % ITEM_HEIGHT;
            } else {
                this._pendingScroll = -(container.scrollTop % ITEM_HEIGHT);
            }
        }

        return false;
    }

    _getSelectedIndex() {
        const container = this.shadowRoot.querySelector("#container");
        return Math.round(container.scrollTop / ITEM_HEIGHT);
    }

    _onKeyDown(event) {
        if (event.key === "ArrowUp") {
            this._pendingScroll -= ITEM_HEIGHT;
            this._animating || this.animatePhysics();
        } else if (event.key === "ArrowDown") {
            this._pendingScroll += ITEM_HEIGHT;
            this._animating || this.animatePhysics();
        }
    }

    _onTouchStart(event) {
        this.trackedTouch = event.targetTouches[0];
    }

    _onTouchEnd(event) {
        this.trackedTouch = null;
    }

    _onTouchMove(event) {
        const currentTouch = this.trackedTouch && Array.from(event.changedTouches).find(touch => touch.identifier === this.trackedTouch.identifier);


        if (currentTouch) {
            this.shadowRoot.querySelector("#container").scrollBy({
                top: this.trackedTouch.screenY - currentTouch.screenY
            });

            this.trackedTouch = currentTouch;
        }
    }

    _onWheelHandler(event) {
        this.shadowRoot.querySelector("#container").scrollBy({
            top: event.deltaY,
            behavior: event.deltaY === Math.round(event.deltaY) ? "smooth" : undefined
        });
    }
}

customElements.define('ar-picker', Picker);