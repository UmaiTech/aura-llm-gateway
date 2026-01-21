# Aura LLM Gateway - Brand Assets

Professional branding assets for the Aura LLM Gateway project.

## Available Assets

### Main Logo (Icon Only)
**File:** `logo.svg` (512×512)
- Primary logo mark with transparent background
- Features concentric circles representing the gateway architecture
- Central "A" lettermark with glow effect
- Suitable for: App icons, small spaces, profile images

### Logo with Text (Vertical)
**File:** `logo-with-text.svg` (512×560)
- Icon with "LLM GATEWAY" text in monospace font positioned close below
- Vertical lockup for square/portrait layouts
- Code-style typography with technical aesthetic
- Suitable for: Documentation headers, README, splash screens, presentations

### Logo Horizontal
**File:** `logo-horizontal.svg` (550×200)
- Icon with "LLM GATEWAY" text in monospace font, horizontal layout
- Code-style typography positioned close to icon
- Perfect for website headers and navigation bars
- Suitable for: Website headers, email signatures, wide banners, navigation

### Favicon
**File:** `favicon.svg` (64×64)
- Simplified version optimized for small sizes
- Solid background with gradient
- Best for: Browser tabs, mobile icons, app bars

### Square Icon
**File:** `icon-square.svg` (512×512)
- Square format with rounded corners
- Solid background suitable for app stores
- Suitable for: Social media profiles, app store listings, PWA icons

## Design System

### Color Palette

```
Primary Colors:
- Violet 400: #A78BFA (light accent)
- Indigo 400: #818CF8 (primary)
- Indigo 500: #6366F1 (primary dark)
- Indigo 600: #4F46E5 (deep)

Supporting:
- White: #FFFFFF (lettermark, highlights)
```

### Design Elements

- **Concentric Circles**: Represent layered gateway architecture
- **"A" Lettermark**: Brand identity and Aura name
- **Glow Effects**: Convey the "aura" concept and energy flow
- **Gradients**: Modern, tech-forward aesthetic

## Usage Examples

### README Header
```markdown
<!-- With text (recommended) -->
<p align="center">
  <img src="assets/logo-with-text.svg" alt="Aura LLM Gateway" width="300"/>
</p>

<!-- Icon only -->
<p align="center">
  <img src="assets/logo.svg" alt="Aura LLM Gateway" width="200"/>
</p>
```

### Website Header/Navigation
```html
<!-- Horizontal layout -->
<img src="/assets/logo-horizontal.svg" alt="Aura LLM Gateway" height="40"/>
```

### HTML Favicon
```html
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/icon-square.svg">
```

### React/Next.js
```jsx
import logo from './assets/logo.svg';

<img src={logo} alt="Aura" className="w-32 h-32" />
```

### Social Media
Use `icon-square.svg` for:
- GitHub social preview (1280×640 - scale and center on colored background)
- Twitter/X profile image
- LinkedIn company logo
- Discord server icon

## Generating PNG Exports

If you need PNG versions (for compatibility or specific platforms), convert using:

```bash
# Install librsvg (macOS)
brew install librsvg

# Generate PNG versions
rsvg-convert -w 512 -h 512 logo.svg -o logo-512.png
rsvg-convert -w 256 -h 256 logo.svg -o logo-256.png
rsvg-convert -w 128 -h 128 logo.svg -o logo-128.png

# Favicon sizes
rsvg-convert -w 32 -h 32 favicon.svg -o favicon-32.png
rsvg-convert -w 16 -h 16 favicon.svg -o favicon-16.png

# App icon sizes (for icon-square.svg)
rsvg-convert -w 512 -h 512 icon-square.svg -o icon-512.png
rsvg-convert -w 192 -h 192 icon-square.svg -o icon-192.png
rsvg-convert -w 180 -h 180 icon-square.svg -o icon-180.png
```

## File Specifications

| File | Size | Format | Use Case |
|------|------|--------|----------|
| logo.svg | 512×512 | SVG | Icon only, app icons |
| logo-with-text.svg | 512×560 | SVG | Vertical layout with monospace text |
| logo-horizontal.svg | 550×200 | SVG | Horizontal layout with monospace text |
| favicon.svg | 64×64 | SVG | Browser favicon |
| icon-square.svg | 512×512 | SVG | Social media, app stores |

## Brand Guidelines

### Do's
✓ Use on light or dark backgrounds
✓ Maintain aspect ratio when scaling
✓ Preserve minimum size of 32×32px for clarity
✓ Use SVG format when possible for crisp rendering

### Don'ts
✗ Don't alter the color scheme
✗ Don't distort or stretch
✗ Don't add drop shadows or external effects
✗ Don't place on busy backgrounds that reduce visibility

## License

These assets are part of the Aura LLM Gateway project and follow the project's license.
