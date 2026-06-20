# Scoring Model

## Why RFME (not standard RFM)

Standard RFM (Recency, Frequency, Monetary) is widely used in e-commerce analytics. We added E (Engagement) as a fourth dimension because:

1. Two customers with identical RFM scores behave very differently if one opens every email and the other ignores all contact
2. Engagement is the early warning signal — a customer can start disengaging weeks before their purchase frequency drops
3. It creates a defensible differentiation from tools that use pure RFM

In Stage 1, E is a placeholder (0.5 for all customers) because Klaviyo is not yet integrated. This is intentional — ship a working product with a known limitation rather than delay launch for a perfect model.

## Normalisation choices

### Recency — exponential decay
```python
score = math.exp(-recency_days / 90)
```
A linear normalisation (e.g. `1 - days/365`) would give a customer who bought 180 days ago a score of 0.5. Exponential decay gives them 0.135 — more accurately reflecting that they are much closer to churning than "halfway" between active and lost. The 90-day half-life was chosen based on the beauty niche's ~28-day repurchase cycle: at 90 days a customer has missed 3 repurchase windows, which is a meaningful signal.

### Frequency — log normalisation
```python
score = math.log(frequency + 1) / math.log(max_freq + 1)
```
The difference between 1 and 2 orders is more significant than the difference between 10 and 11. Log normalisation captures this diminishing return. The `+1` prevents log(0).

### Monetary — percentile rank within store
```python
score = spend / store_max_spend
```
A $500 lifetime spend means something very different at a luxury jewellery store vs a $15 soap store. By ranking within the store's own customer base, the M score is always relative and comparable. This also means two stores can be compared on segment distribution even if their AOVs differ by 10x.

## Static weights (Stage 1)

```
Recency:    0.35
Frequency:  0.25
Monetary:   0.25
Engagement: 0.15
```

Recency is highest because it is the most actionable signal — a merchant can do something about a customer who just went quiet. Engagement is lowest because it is a placeholder in Stage 1.

## Per-niche weight tuning (Stage 2 plan)

Once feedback loop data is available (month 3+), calibrate weights per niche:

| Niche | R | F | M | E | Rationale |
|-------|---|---|---|---|-----------|
| Beauty/skincare | 0.30 | 0.30 | 0.25 | 0.15 | Routine repurchasers — frequency is a strong loyalty signal |
| Supplements | 0.40 | 0.25 | 0.20 | 0.15 | Strict reorder cycles — recency deviation is the key signal |
| Fashion | 0.30 | 0.20 | 0.35 | 0.15 | AOV spikes matter more; seasonal purchase patterns |

These are starting points. The real calibration comes from comparing predicted vs actual churn across stores with different weight configurations.

## Segment thresholds — why these numbers

```
VIP        80–100
Returning  60–79
At-risk    40–59
Churning   20–39
Lost       0–19
```

These are not arbitrary. A score of 40 means: the customer's combined recency, frequency, monetary, and engagement performance is at 40% of what a perfect customer would look like. Below 40 they need active intervention. Below 20 intervention is statistically unlikely to succeed.

The thresholds will be refined in Stage 3 when the ML model provides actual churn probabilities. At that point, the segment boundaries will shift to match empirical return rates from the feedback loop data.

## The ignore recommendation

Rec 3 triggers when: `score < 18 AND segment = "Lost"`.

This is the most important recommendation in the product. Sending marketing emails to lost customers:
- Costs money (per-send pricing on Klaviyo/Omnisend)
- Damages deliverability (low open rates hurt sender reputation)
- Annoys customers who have genuinely moved on

No competitor surfaces this explicitly as a recommended action. It saves merchants real money and builds trust in the product's intelligence.

The threshold of 18 (not 20, the segment boundary) adds a buffer. A score of 19 is technically "Lost" but not yet definitively gone — give it one more cycle before recommending ignore.
