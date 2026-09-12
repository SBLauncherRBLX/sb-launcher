# SB Launcher visual refresh

Local design update, 2026-09-11. No public release/version bump.

- About: generated optical-glass background, wide 16:9 composition, centered live app name/version. Existing triple-click slogan and update controls retained.
- Navigation and settings sections: 20 original SVG pictograms share a neutral charcoal tile, consistent proportions and individual colors inspired by the supplied Bold Dark reference. SVG definitions use React useId so repeated icons do not collide.
- Brand logo and existing user themes remain available.

## Banner asset

`apps/desktop/src/assets/about-glass-banner.png` — generated using the built-in image_gen tool. No external API/CLI was used. Typography is rendered by React, not baked into the image.

Prompt:

Use case: stylized-concept. Asset type: finished premium abstract background for SB Launcher About banner. Create a wide 16:9 landscape, ideally 2560x1440 or higher. Visual references described: luxurious mobile OS launch wallpapers, deep midnight blue empty center framed by enormous curved optical glass sheets, luminous violet and electric cobalt rims, with one restrained amber-peach refracted highlight at lower right. Sculptural continuous glass ribbons sweep from upper left and curl across the bottom and right edges; asymmetrical flowing composition, not concentric rings. Real high-end 3D render: thick translucent glass, believable internal refraction, polished edge reflections, subtle satin microtexture, rich black-blue shadows, exquisitely smooth surfaces, precision anti-aliasing. Fill the frame edge to edge. Keep the central 45 percent quiet dark navy for later white HTML title overlay. Strong material depth, elegant broad forms, tiny controlled specular edges. No text, no letters, no numbers, no logos, no watermark, no UI, no stars or glitter, no excessive bloom. Do not copy ColorOS branding. This is a final production background, not a mockup.
