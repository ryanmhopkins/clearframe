# ClearFrame Mac visual direction

The Mac app now carries the website's core palette: `#101010` background, `#151515` surfaces, `#EFEFEC` text, and `#6B9FFF` accent. The cleaning flow stays in one focused workspace. Onboarding pairs a short privacy story with the email sign-in action; account and Pro screens follow the same material and type system.

## References reviewed

- [HapiGo — Dark Mode](https://dribbble.com/shots/22609256-HapiGo-Dark-Mode): compact desktop information hierarchy and calm dark surfaces.
- [Nulis — Notes Desktop App Dark](https://dribbble.com/shots/19751267-Nulis-Notes-Desktop-App-Dark): readable sidebar rhythm and controlled emphasis.
- [Smart Home App — Dark Glassmorphism UI](https://dribbble.com/shots/27158715-Smart-Home-App-Dark-Glassmorphism-UI): restrained blue light and tactile glass accents.
- [Apple's Liquid Glass guidance](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass): use system material primarily for functional controls and preserve contrast and reduced-transparency behavior.

The implementation is an original ClearFrame layout. On macOS 26 and later it uses SwiftUI `glassEffect` on the drop target, onboarding sign-in surface, and action bar. Earlier supported macOS versions use native ultra-thin material. Content and metadata rows remain stable dark surfaces so their text stays readable.
