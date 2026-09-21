SB Launcher 3.4.3 demo — private local build

1. Close the regular SB Launcher (both use the registered Roblox OAuth callback port 8787).
2. Run SB Launcher.exe from this folder. Keep runtime/, Assets/ and private-demo.flag next to it.
3. The default design is Material You: solid tonal surfaces, filled buttons, switches and sliders.
   For an existing demo profile, choose Visuals > Presets > Material You, or press Reset.
4. Open Visuals > Textured visual effects. Enable Glass and choose Frosted or Liquid Glass.
   Both modes share a draggable preview and sample controls.
   Material You uses locally bundled Google Material Symbols Rounded (700 / grade 0 / optical size 48).

Settings apply instantly and persist automatically in the demo WebView profile.
Refraction, lens edge width, blur, saturation, theme tint, rim light, shadow,
corner radius, animation duration, press scale and map resolution are adjustable.
Enable glass separately for navigation, buttons, panels, cards and controls.
The preview lens can be dragged or moved with arrow keys (Home recentres it).
Turning Glass off hides its settings and preview.
Balanced / Crystal / Frosted presets and Reset glass are provided.
System reduced-motion and the launcher's global motion settings take precedence.
The navigation pill animates in both Material You and Liquid Glass modes.
To return to Material You, turn Glass off.
Liquid maps are reused when tuning optics; offscreen surfaces skip backdrop filtering.

This build is not published. Automatic updates and native update installation are disabled.
Demo data: %LOCALAPPDATA%\SB Launcher 3.4.3 Demo
The stable app's profile and sblauncher:// handler are not replaced.
The demo uses its own sblauncher-demo:// handler for OAuth return.
Roblox sign-in is separate. Normal online features still connect to their existing services.

Experimental graphics: this is an independent implementation inspired by the reference,
not a pixel-perfect copy. Refraction needs a current Chromium/WebView2 runtime.
All cards is optional because overlapping filtered surfaces can increase GPU load.
