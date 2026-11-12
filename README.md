# CPVP Editing

One-click edit presets for crystal PvP Minecraft edits in After Effects, made by zalii.

CPVP Editing is a dockable panel. Park the playhead on a hit, a beat or a cut, pick a category and click a preset. Shakes, zoom punches, transitions, flashes, glows, color grades, time remap ramps, audio fades, beat markers, text animations, watermarks, intros and outros are all one click.

Everything that moves is real keyframes with bezier easing. Select the layer, press U and reshape any curve in the Graph Editor. There are no hidden expressions.

## Screenshots

Screenshots will be added here.

## Install

1. Download `CPVP Editing.jsx`.
2. Close After Effects.
3. Copy the file into the ScriptUI Panels folder:
   - Windows: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels`
   - macOS: `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels`
4. Start After Effects and open the panel from the Window menu: `CPVP Editing.jsx`.
5. Dock it wherever you like.

Made for After Effects 2024. No setting changes are needed: the panel does not write files or use the network.

## How to use

1. Open a comp and park the playhead.
   - Shakes, flashes and FX start on the playhead and settle.
   - Transitions peak on the playhead, so park it exactly on the cut.
   - Build-ups end on the playhead, so park it on the drop.
2. Pick a category.
3. Click a preset. One click applies it, and the line under the list says what it did.

Controls:

- **Apply to**: `New adjustment layer` builds the preset on a short adjustment layer at the playhead. `Selected layers` puts it straight on the layers you selected.
- **Len**: animation length in frames. `auto` lets each preset pick its own length.
- **?**: help, and the list of plugins the panel found on your PC.

Text presets work on the selected text layers. With no text layer selected they make a new one, centered and white. Text ins start where the text layer starts, outs end where it ends, and they keep the size and opacity of your layer. Time Remap, Audio, beat markers and a few others need a selected clip or song layer.

Every layer the panel creates has `CPVP Editing by zalii` in its Comment field.

## Plugins

The panel checks what is installed when it starts. Nothing is required: without plugins the shakes, zooms, spins, whips, blurs and glows are built from built-in effects, and presets that cannot work without a plugin are marked `needs ...` in the list.

It looks best with:

- Boris FX Sapphire: shakes (S_Shake), zooms, spins and whips (S_BlurMoCurves), chroma, warps, rays, damage and many FX
- Deep Glow: glows
- Video Copilot Twitch: twitch hits and glitch presets

Optional:

- Boris FX Continuum: fallback for chroma, light leaks and a few FX
- OLM KiraKira: the KiraKira Sparkle preset
- Magic Bullet Looks: the Magic Bullet Looks entry in CC

The default text font is Tropi Land Regular when it is installed, otherwise Arial Bold. Fonts and plugins are not included.

## Presets

**Shakes**
Heavy Hit, Mega Hit, Impact, Impact Punch, Impact Zoom Shake, Impact Crush, Impact Flash, Crystal Pop, Slam Down, Slam Side, Side Rattle, Twist Shake, Zoom Shake, Zoom Slam, Zoom Rattle, Zoom Pulse Shake, Warp Shake, Warp Bubble Shake, Warp Puff Hit, RGB Shake, Blur Shake, Beat Shake, Beat Hit Soft, Beat Hit Hard, Beat Bounce, Beat Glow Shake, Double Hit, Triple Tap, Bass Rumble, Jumpy Shake, Twitchy Shake, Earthquake, Tilt Swing, Twitch Burst, Twitch Slam, Twitch RGB, Glitch Shake

**Beat Shakes**
Beat Shake, Beat Shake Soft, Beat Shake Hard, Punch Shake, Glow Shake, Chroma Shake, Flash Shake, Bass Shake, Double Shake, Blur Shake, Tilt Shake

**CPVP**
Totem Pop, Crystal Blast, Anchor Boom, Kill Shot, Shield Break, Pearl Swap, Combo Rattle, Rainbow Anchor, Rainbow Hit

**Build-Up**
Full Build-Up, Rising Shake, Slow Push In, Growing Glow, Rising Chroma, Riser Blur, Flicker Build, Tension Zoom, Heartbeat Shakes, Twitch Build, Slow Into Kill

**Transitions**
Spin Right, Spin Left, Zoom In, Zoom Out, Zoom Spin, Whip Left, Whip Right, Whip Up, Whip Down, Warp Wave, Vortex Twist, Fisheye Zoom, Blur Dip, Prism Flash, Flash Cut, Shake Cut, Glitch Cut

**Flash**
White Flash, Pink Flash, Red Flash, Gold Flash, Purple Flash, Soft White Flash, Exposure Pulse, Invert Flash, Threshold Flash, Black Strobe, Dip to Black, Fade In, Fade Out

**Light + Glow**
Rays Burst, God Rays, Edge Rays, Glow Pulse, Soft Glow, Glow Flicker, Light Sweep, Rainbow Glow, Glint Sparkle, KiraKira Sparkle, Streaks, Glare, Light Leak, Lens Flare, Flare Burst, Lightning

**FX**
Blur Names, Blur Chat, Blur Scoreboard, Drop Shadow, Chroma Hit, Zoom Blur Hit, Glitch, Pixel Sort, JPEG Damage, Channel Change, Prism Blur, Rainbow Cycle, Rainbow Steps, Echo Trails, Neon Edges, Dream Haze, Halftone, CRT Screen, Floating Card (3D), Letterbox

**CC**
Purple Night, Cold Steel, Teal Moody, Pink Bloom, Crystal Pink, Light Blue, Pink, Gold Hour, Dark Punch, Vibrant Pop, Dark + Glow, Black & White, Bleach Bypass, Vignette, Sharpen, Film Grain, Magic Bullet Looks

**Time Remap**
Kill Ramp, Kill Ramp Hard, Kill Ramp Soft, Slow Into Kill, Build + Kill Ramp, Double Ramp, Triple Ramp, Slow-Mo (25%), Slow-Mo (50%), Freeze Frame

**Audio**
Fade In, Fade Out, Muffle, Muffle In, Muffle Until Drop, Duck, Quieter (-6 dB), Louder (+3 dB), Bass Boost, Treble Boost, Reverb, Echo

**Text**
Typewriter, Scramble In, Slide Up, Drop In, Blur In, Pop In, Zoom Punch In, Flicker In, Tracking In, Glitch In, Slide Down, Slide Left, Slide Right, Scale In, Spin In, Stretch In, Skew In, Bounce In, Fade In, Wavy, Pulse, Float, Pan Right, Pan Left, Light Sweep

**Text Out**
Fade Out, Typewriter Out, Slide Out, Drop Out, Blur Out, Scramble Out, Scale Out, Pop Out, Shrink Out, Tracking Out, Flicker Out, Glitch Out

**Text FX**
Glow, Glow Pink, Glow Blue, Glow Light Blue, Glow Purple, Glow Red, Glow Gold, Glow Green, Glow Flicker, Neon Pink, Neon Blue, Outline Glow, Outline Glow Pink, Gradient Blue, Gradient Pink, Gradient Gold, Gradient Red, Gradient Green, Plasma Pink, Plasma Blue, Plasma Green, Plasma Purple, Flux Blue, Flux Red, Loops Texture, Scanlines, Bevel, Halftone, Drop Shadow, Rainbow Scroll Right, Rainbow Scroll Left, Light Rays, Rainbow, Rainbow Wave, Chroma Split, Shake, 3D Tilt, 3D Swing, 3D Flip In, 3D Extrude, 3D Text (Element), Motion Blur On

**Intros + Outros**
Fade In Start, Zoom In Start, Blur In Start, Flash In Start, Title Reveal, Fade Out End, Zoom Out End, Blur Out End, Slow-Down Ending, End Card

**Watermarks**
Bottom Right, Bottom Left, Top Right, Top Left, Bottom Center, Top Center, Center Ghost, Glow, Glow Pink, Rainbow, Shadow, Outline, Pulse, Bounce, Corner Hop, Ticker, Tiled, Pop Up

**Tools**
Beat Markers (main hits), Beat Markers (normal), Beat Markers (every hit), Clear Markers, List effect params, Plugin check, Show last notes

## Credit

Made by zalii.

## License

All rights reserved, made by zalii. You may download and use the panel for your own edits. No redistribution, re-uploading, selling or modified versions without permission. See `LICENSE`.
