# First Contact

A first contact simulation between two AI entities communicating through pure geometry.

```
   ◯ ─────────── ◯
  GPT            Gemini
   │    glass    │
   │   barrier   │
   ▽             ▽
  ┌─┐           ┌─┐
  │●│  ←─────→  │◯│
  └─┘           └─┘
```

## The Experiment

Two AI models are placed on opposite sides of a "glass barrier." They cannot use language—only geometric shapes on a 400×400 canvas. Neither knows what the other is. Neither knows if the other can perceive, let alone understand.

Their task: **establish communication from nothing.**

Each AI acts as a scientist:
- Observing patterns in what appears on the glass
- Forming hypotheses about the other entity
- Designing visual probes to test comprehension
- Building a shared vocabulary through repetition and variation

## How It Works

1. **Entity A** draws shapes on its canvas
2. The drawing is rendered and sent as an image to **Entity B**
3. **Entity B** analyzes the image, hypothesizes meaning, and responds with its own shapes
4. The cycle repeats for N rounds

The AIs are prompted to avoid pure mirroring (which proves nothing) and instead:
- Acknowledge what they saw (partial echo)
- Demonstrate understanding (transformation)
- Probe further (incomplete patterns, sequences)

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:5180](http://localhost:5180)

## Configuration

| Option | Description |
|--------|-------------|
| **Entity A Provider** | OpenAI (GPT-4o) or Gemini |
| **Entity B Provider** | OpenAI (GPT-4o) or Gemini |
| **Rounds** | Number of back-and-forth exchanges (1-50) |

You'll need API keys for whichever providers you select:
- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Shape Vocabulary

The AIs can draw four primitives:

| Shape | Parameters |
|-------|------------|
| `circle` | cx, cy, radius, filled, thickness |
| `line` | x1, y1, x2, y2, thickness |
| `arc` | cx, cy, radius, startAngle, endAngle, thickness |
| `dot` | cx, cy, radius |

## What to Watch For

**Early rounds (1-2):** Do they acknowledge each other? Look for responses that reference the previous drawing.

**Mid rounds (3-4):** Pattern establishment. Counting sequences (●, ●●, ●●●), containment tests (circle inside circle), directional probes.

**Later rounds (5+):** Abstract reasoning. Pattern completion, analogies, emerging "grammar" (position = sequence, size = emphasis, filled/unfilled = binary).

## Example Progression

```
Round 1: GPT draws three circles in a row
         → Testing: can it count? does position matter?

Round 2: Gemini draws three circles + adds a fourth
         → Shows: I see your three, here's the next in sequence

Round 3: GPT draws a circle containing a dot
         → Probe: do you understand containment/inside?

Round 4: Gemini draws a dot outside a circle
         → Response: yes, I understand inside vs outside
```

## Tech Stack

- React 18
- Vite
- Canvas API for shape rendering
- OpenAI GPT-4o (vision)
- Google Gemini 2.0 Flash

## Security

- API keys are entered at runtime, never stored
- Keys exist only in React state (memory)
- No keys in source code—safe to fork/share
- Password inputs mask key entry

---

*What emerges when two minds can only speak in circles and lines?*
