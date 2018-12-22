# ar-picker

A [Cupertino (iOS-style) Picker](https://developer.apple.com/design/human-interface-guidelines/ios/controls/pickers/) inspired component for the web, built on **lit-html**.

## Get started

1) Install the component using npm

    ```npm install @ryanafrish7/ar-picker```

2) Import it into your module script

    ```import "@ryanafrish7/ar-picker";```

    Or into your HTML webpage

    ```<script type="module" src="node_modules/@ryanafrish7/ar-picker/ar-picker.js"></script>```

    This adds `ar-picker` to the Custom Elements registry

3) Use the component in your webpage

    ```html
        <ar-picker id="zodiac"></ar-picker>
        <script>
            const zodiacPicker = document.querySelector("#zodiac");

            zodiacPicker.items = [
                "Capricorn", "Aquarius", "Pisces", "Aries", "Taurus", "Gemini", "Cancer", "Leo", 
                "Virgo", "Libra", "Scorpio", "Ophiuchus", "Sagittarius"
            ];

            zodiacPicker.addEventListener("select", event => {
                console.log(event.detail.selected);
            });
        </script>
    ```

4) Serve your webpage using `polymer serve`. This component uses npm convention to resolve dependencies by name. The polymer-cli handles this transformation automatically.
