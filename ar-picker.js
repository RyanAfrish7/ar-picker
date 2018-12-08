import { LitElement, html } from "@polymer/lit-element"; 
import { repeat } from "lit-html/directives/repeat";
import { style } from "./ar-picker-css";

/**
* @polymer
* @extends HTMLElement
*/
class Picker extends LitElement {
    static get properties() {
        return {
            items: { type: Array }
        };
    }

    constructor() {
        super();
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
                }

                #container {
                    display: flex;
                    flex-direction: column;
                }
            </style>
            <div id="container">
                ${repeat(this.items, this.renderItem.bind(this))}
            </div>
        `;
    }

    renderItem(item) {
        return html`<div class="item">${item}</div>`;
    }
}

customElements.define('ar-picker', Picker);
