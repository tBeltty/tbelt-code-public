- radio "Custom address" [checked]
- text: Custom address
- textbox "Custom address" [invalid]:
  - /placeholder: https://npm.example.com/
  - text: invalid-registry
- alert: Enter an address starting with http:// or https://
- text: Enter an internal or private npm registry address starting with http:// or https://. If it requires a login, store the credentials in ~/.npmrc on this machine.

{
  "registry": [
    {
      "colorScheme": "light",
      "focused": {
        "outline": "none",
        "boxShadow": "rgb(62, 166, 240) 0px 0px 0px 0.5px inset",
        "borderColor": "rgb(229, 83, 75)"
      },
      "blurred": {
        "outline": "none",
        "boxShadow": "none",
        "borderColor": "rgb(229, 83, 75)"
      }
    },
    {
      "colorScheme": "dark",
      "focused": {
        "outline": "none",
        "boxShadow": "rgb(62, 166, 240) 0px 0px 0px 0.5px inset",
        "borderColor": "rgb(229, 83, 75)"
      },
      "blurred": {
        "outline": "none",
        "boxShadow": "none",
        "borderColor": "rgb(229, 83, 75)"
      }
    }
  ],
  "packageName": [
    {
      "colorScheme": "light",
      "focused": {
        "outline": "none",
        "boxShadow": "rgb(62, 166, 240) 0px 0px 0px 0.5px inset",
        "borderColor": "rgb(229, 83, 75)"
      },
      "blurred": {
        "outline": "none",
        "boxShadow": "none",
        "borderColor": "rgb(229, 83, 75)"
      }
    },
    {
      "colorScheme": "dark",
      "focused": {
        "outline": "none",
        "boxShadow": "rgb(62, 166, 240) 0px 0px 0px 0.5px inset",
        "borderColor": "rgb(229, 83, 75)"
      },
      "blurred": {
        "outline": "none",
        "boxShadow": "none",
        "borderColor": "rgb(229, 83, 75)"
      }
    }
  ]
}
