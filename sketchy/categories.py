"""Canonical, ordered category list for Sketchy.

Class index i corresponds to CATEGORIES[i] in the trained model and labels.json.
Names MUST match Quick Draw simplified dataset filenames exactly (lowercase, spaces).
"""

CATEGORIES = [
    # animals (28)
    "cat", "dog", "fish", "bird", "butterfly", "bee", "snail", "spider",
    "octopus", "crab", "snake", "frog", "duck", "owl", "penguin", "elephant",
    "giraffe", "lion", "horse", "pig", "cow", "sheep", "rabbit", "mouse",
    "bear", "shark", "dolphin", "monkey",
    # nature (14)
    "tree", "flower", "leaf", "cactus", "mushroom", "cloud", "sun", "moon",
    "star", "rainbow", "mountain", "fire", "snowflake", "palm tree",
    # food/drink (14)
    "apple", "banana", "pizza", "hamburger", "hot dog", "ice cream", "cake",
    "cookie", "donut", "carrot", "bread", "egg", "coffee cup", "wine glass",
    # household/objects (32)
    "house", "door", "key", "clock", "light bulb", "candle", "scissors",
    "hammer", "ladder", "umbrella", "eyeglasses", "chair", "table", "bed",
    "television", "telephone", "camera", "book", "pencil", "paintbrush",
    "envelope", "fork", "knife", "spoon", "lock", "anvil", "bucket", "broom",
    "hat", "crown", "shoe", "mug",
    # transport (12)
    "car", "bus", "truck", "train", "airplane", "helicopter", "bicycle",
    "sailboat", "rocket", "submarine", "hot air balloon", "canoe",
    # music (6)
    "guitar", "piano", "drums", "trumpet", "violin", "saxophone",
    # sport/misc (8)
    "basketball", "tennis racquet", "dumbbell", "axe", "sword", "kite",
    "tent", "windmill",
    # symbols/body (6)
    "wheel", "tornado", "skull", "eye", "hand", "smiley face",
]
