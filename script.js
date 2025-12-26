const MS_PER_CYCLE = 15 * 60 * 1000; // 15 in-game minutes
const START_TIME = new Date('2025-12-24T14:00:00Z');
const END_TIME = new Date('2025-12-25T18:00:00Z');
const TOTAL_MILES = 280;
const MAX_GAS = 20;
const MOODS = ['Empty', 'PrankWar', 'Sassy', 'Happy', 'Hyped'];
const paceSettings = {
  crawl: { label: 'Scenic Shuffle', speed: 40, gasMod: -0.1 },
  cruise: { label: 'Steady Roll', speed: 60, gasMod: 0.1 },
  dash: { label: 'Express Dash', speed: 80, gasMod: 0.35 },
};
const rationSettings = {
  crust: { label: 'Crust Only', perHour: 0.5 },
  sip: { label: 'Balanced Bites', perHour: 1.5 },
  party: { label: 'Pizza Party', perHour: 3 },
};
const vibes = {
  eco: { label: 'Eco-Architect', budget: 400, multiplier: 1 },
  budget: { label: 'Budget-Savvy', budget: 225, multiplier: 2 },
  hustle: { label: 'Little League Hustle', budget: 125, multiplier: 3 },
};

const landmarks = [
  { miles: 50, name: 'Snoqualmie Pass', text: 'Snow, sled jokes, and Miles begging to snowboard.' },
  { miles: 80, name: 'Cle Elum', text: 'Pizza bakery heaven. Michelle finds a coupon!' },
  { miles: 140, name: 'Vantage', text: 'Columbia River views and roadside selfies.' },
  { miles: 180, name: 'Moses Lake', text: 'Fast-food oasis. Mystery pizza toppings abound.' },
  { miles: 240, name: 'Sprague Lake', text: 'Quiet rest stop. Calvin hides Michelle’s phone.' },
];

const weatherTable = [
  { type: 'Clear', mod: 1 },
  { type: 'Rain', mod: 0.9 },
  { type: 'Snow', mod: 0.8 },
  { type: 'Fog', mod: 0.7 },
];

const sceneArt = [
  { miles: 0, id: 'scene-seattle', caption: 'Seattle start — neon skyline & coffee steam.' },
  { miles: 50, id: 'scene-snoqualmie', caption: 'Snoqualmie Pass — snowy switchbacks.' },
  { miles: 80, id: 'scene-cle-elum', caption: 'Cle Elum — pizza ovens glowing.' },
  { miles: 140, id: 'scene-vantage', caption: 'Vantage — Columbia River glow.' },
  { miles: 180, id: 'scene-moses-lake', caption: 'Moses Lake — fast-food strip lights.' },
  { miles: 240, id: 'scene-sprague', caption: 'Sprague Lake — quiet rest stop.' },
  { miles: 280, id: 'scene-spokane', caption: 'Spokane — Grandma’s tree shines.' },
];

const eventArt = {
  traffic: 'event-traffic',
  spill: 'event-pizzaspill',
  work: 'event-workcall',
  coupon: 'event-coupon',
  wifi: 'event-wifidrop',
  snow: 'event-snowstorm',
  breakdown: 'event-breakdown',
};

const eventCooldown = new Map();
let loopId = null;
let pausedForEvent = false;
let prankTimer = null;
let suppressLog = false;
const oddGifts = ['Gas station snow globe', 'Roadside keychain', 'Single candy cane', 'Motel soap set', 'Expired coupon book', 'Handmade pinecone ornament'];
const oddGiftsExtended = [
  'Truck stop bobblehead',
  'Glow-in-the-dark sticker sheet',
  'Mini air freshener pack',
  'Plastic snowman figurine',
  'Novelty pizza slicer',
  'DIY ornament kit',
  'Holiday car freshener',
  'Retro cassette tape',
  'Pocket flashlight',
  'Fuzzy dice',
  'Snowflake magnet',
  'Travel mug with gas logo',
  'Warm socks from rest stop',
  'Mini board game',
  'Cheesy postcard set',
  'Gift card with $5 left',
  'Candy sampler bag',
  'Knitted beanie from vendor',
  'Handmade friendship bracelet',
  'Tiny plush reindeer',
];

const state = {
  vibe: vibes.eco,
  time: new Date(START_TIME),
  milesTraveled: 0,
  landmarkIndex: 0,
  weather: weatherTable[0],
  family: [
    { name: 'Will', mood: 3, ailment: null },
    { name: 'Michelle', mood: 3, ailment: null },
    { name: 'Calvin', mood: 3, ailment: null },
    { name: 'Miles', mood: 3, ailment: null },
  ],
  inventory: { gas: 15, pizza: 48, battery: 80, emergencyKits: 2, cash: 500 },
  settings: { pace: 'cruise', rations: 'sip' },
  scores: { hits: 0 },
  cooldowns: { event: 0 },
  highScore: null,
  presents: { mode: 'planned', items: [] },
  goingBack: false,
};

const events = [
  {
    id: 'traffic',
    name: 'Traffic Jam',
    probability: 20,
    condition: () => true,
    description: 'Gridlock on I-90. Everyone sighs.',
    choices: [
      { label: 'Push Through (-0.5 mood)', effect: (s) => changeMoodAll(s, -0.5, 'Traffic crawl') },
      {
        label: 'Detour (70% success, else -1 gas)',
        effect: (s) => {
          const success = roll(100) <= detourSuccess(s);
          if (!success) {
            s.inventory.gas = Math.max(0, s.inventory.gas - 1);
            log('Detour failed. Lost 1 gas.', 'WARN');
          } else {
            s.milesTraveled += 5;
            log('Backroad shortcut worked! +5 miles.', 'INFO');
          }
        },
      },
      { label: 'Wait it out (lose a turn)', effect: (s) => s.skipNext = true },
    ],
  },
  {
    id: 'breakdown',
    name: 'Random Breakdown',
    probability: 8,
    condition: () => true,
    description: 'The Pilot breaks down on the shoulder.',
    choices: [
      {
        label: 'Use repair kit',
        effect: (s) => {
          if (s.inventory.emergencyKits <= 0) {
            showEnd('Car Breakdown', 'No emergency kits left. Trip over.');
            return;
          }
          s.inventory.emergencyKits -= 1;
          s.skipNext = true;
          changeMoodAll(s, -0.5, 'Delay from breakdown');
        },
      },
    ],
  },
  {
    id: 'spill',
    name: 'Pizza Spill',
    probability: 15,
    condition: (s) => s.inventory.pizza > 0,
    description: 'A pizza box flips. Cheese tragedy.',
    choices: [
      { label: 'Clean up (-0.5 mood)', effect: (s) => changeMoodAll(s, -0.5, 'Messy cleanup') },
      {
        label: 'Ignore (-1 mood next turn)',
        effect: (s) => (s.flags = { ...(s.flags || {}), delayedMood: -1 }),
      },
    ],
  },
  {
    id: 'work',
    name: 'Work Call',
    probability: 10,
    condition: (s) => s.milesTraveled > 50,
    description: 'Will gets a work call about battery specs.',
    choices: [
      {
        label: 'Take the call (-10% speed, -1 Will)',
        effect: (s) => {
          s.flags = { ...(s.flags || {}), speedMod: 0.9, speedModCycles: 2 };
          changeMood(s.family[0], -1, 'Work call stress');
        },
      },
      {
        label: 'Ignore (10% chance -2 mood next turn)',
        effect: (s) => {
          if (roll(100) < 10) {
            s.flags = { ...(s.flags || {}), delayedMood: -2 };
            log('Will regrets ignoring the call. Mood hit coming.', 'WARN');
          }
        },
      },
    ],
  },
  {
    id: 'coupon',
    name: 'Found Coupon',
    probability: 10,
    condition: () => true,
    description: 'Michelle finds a crumpled coupon.',
    choices: [
      { label: 'Redeem for 1 pizza pie (8 slices)', effect: (s) => { s.inventory.pizza = Math.min(1000, s.inventory.pizza + 8); } },
      { label: 'Cash it for $16', effect: (s) => (s.inventory.cash += 16) },
    ],
  },
  {
    id: 'wifi',
    name: 'Phone Batteries Dying',
    probability: 15,
    condition: (s) => s.inventory.battery <= 0,
    description: 'Calvin and Miles watch their phones fade to black.',
    choices: [
      { label: 'Hand over extra pizza to distract (-2 slices)', effect: (s) => (s.inventory.pizza = Math.max(0, s.inventory.pizza - 2)) },
      { label: 'Ignore them (-1 mood kids)', effect: (s) => boostKids(s, -1) },
    ],
  },
  {
    id: 'snow',
    name: 'Snowstorm',
    probability: 15,
    condition: (s) => s.milesTraveled < 100,
    description: 'Thick snow at Snoqualmie.',
    choices: [
      {
        label: 'Drive slow (50% distance for 3 cycles)',
        effect: (s) => (s.flags = { ...(s.flags || {}), speedMod: 0.5, speedModCycles: 3 }),
      },
      {
        label: 'Push through (25% crash chance)',
        effect: (s) => {
          if (roll(100) < 25) {
            hideEvent();
            pausedForEvent = false;
            showEnd('Snowstorm Crash', 'A slide-out ends the trip.', false, 'scene-car-crash');
          } else {
            s.inventory.gas = Math.max(0, s.inventory.gas - 1);
            log('Pushed through the snowstorm.', 'WARN');
          }
        },
      },
    ],
  },
];

function $(id) {
  return document.getElementById(id);
}

function roll(max) {
  return Math.random() * max;
}

function init() {
  setupStartForm();
  setupControls();
  updateBudgetUI();
  renderFamily();
  log('Welcome to the Doornink family road trip! Stock up and hit the road.', 'INFO');
}

function setupStartForm() {
  const inputs = ['start-gas', 'start-pizza', 'start-kits'];
  inputs.forEach((id) => {
    const el = $(id);
    const label = $(`${id}-val`);
    const sync = () => {
      label.textContent = el.value;
      updateBudgetUI();
    };
    el.addEventListener('input', sync);
    sync();
  });

  $('vibe').addEventListener('change', updateBudgetUI);
  $('start-btn').addEventListener('click', startGame);
}

function updateBudgetUI() {
  const vibeKey = $('vibe').value;
  const vibe = vibes[vibeKey];
  const gas = Math.round(Number($('start-gas').value) * 6.5);
  const pizza = Math.round(Number($('start-pizza').value) * 15.6); // pies not slices
  const kits = Math.round(Number($('start-kits').value) * 26);
  let spent = gas + pizza + kits;
  const budget = vibe.budget;
  // If overspending, proportionally trim sliders to fit budget
  if (spent > budget) {
    const inputs = [
      { id: 'start-gas', costPerUnit: 6.5 },
      { id: 'start-pizza', costPerUnit: 15.6 }, // per pie
      { id: 'start-kits', costPerUnit: 26 },
    ];
    const maxCost = inputs.reduce((s, i) => s + Number($(i.id).value) * i.costPerUnit, 0);
    if (maxCost > 0) {
      const ratio = budget / maxCost;
      inputs.forEach((i) => {
        const adjusted = Math.min(Number($(i.id).max), Math.floor(Number($(i.id).value) * ratio));
        $(i.id).value = adjusted;
        $(`${i.id}-val`).textContent = adjusted;
      });
      // Recompute spend after adjustment
      const gasAdj = Math.round(Number($('start-gas').value) * 6.5);
      const pizzaAdj = Math.round(Number($('start-pizza').value) * 15.6);
      const kitsAdj = Math.round(Number($('start-kits').value) * 26);
      spent = gasAdj + pizzaAdj + kitsAdj;
    }
  }
  $('budget-total').textContent = vibe.budget;
  $('budget-spent').textContent = spent;
  $('budget-left').textContent = Math.max(0, vibe.budget - spent);
}

function startGame() {
  const vibeKey = $('vibe').value;
  state.vibe = vibes[vibeKey];
  state.time = new Date(START_TIME);
  state.milesTraveled = 0;
  state.landmarkIndex = 0;
  state.weather = weatherTable[0];
  state.family.forEach((f) => {
    f.mood = 3;
    f.ailment = null;
  });
  state.inventory = {
    gas: Number($('start-gas').value),
    pizza: Number($('start-pizza').value) * 8, // store as slices internally
    battery: 100,
    emergencyKits: Number($('start-kits').value),
    cash: state.vibe.budget - Number($('budget-spent').textContent),
  };
  state.settings = { pace: 'cruise', rations: 'sip' };
  state.flags = {};
  state.skipNext = false;
  state.presents = { mode: 'planned', items: [] };
  state.goingBack = false;
  eventCooldown.clear();
  clearInterval(loopId);
  loopId = null;
  pausedForEvent = false;
  $('start-screen').classList.add('hidden');
  $('game-ui').classList.remove('hidden');
  log('Loaded the Honda Pilot with supplies. Let\'s roll!', 'INFO');
  updateUI();
}

function setupControls() {
  document.querySelectorAll('[data-pace]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.settings.pace = btn.dataset.pace;
      document.querySelectorAll('[data-pace]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateUI();
    }),
  );
  document.querySelectorAll('[data-rations]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.settings.rations = btn.dataset.rations;
      document.querySelectorAll('[data-rations]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateUI();
    }),
  );
  $('drive-btn').addEventListener('click', () => tick(false));
  $('stop-btn').addEventListener('click', () => restCycle());
  $('eat-btn').addEventListener('click', feedNow);
  $('trade-btn').addEventListener('click', trade);
  $('restart-btn').addEventListener('click', () => location.reload());
}

function restCycle() {
  tick(true);
}

function tick(resting) {
  if (pausedForEvent) return;
  advanceTime();
  maybeChangeWeather();
  if (maybeForgotPresents()) {
    updateUI();
    return;
  }
  if (state.skipNext) {
    state.skipNext = false;
    updateUI();
    return;
  }
  let distance = 0;
  if (!resting) {
    distance = computeDistance();
    if (state.goingBack) {
      state.milesTraveled = Math.max(0, state.milesTraveled - distance);
      if (state.milesTraveled <= 0) {
        state.goingBack = false;
        state.presents = { mode: 'planned', items: ['Wrapped gifts from home'] };
        state.inventory.cash += 30;
        showPresentsReturn();
      }
    } else {
      state.milesTraveled = Math.min(TOTAL_MILES, state.milesTraveled + distance);
    }
    consumeGas(distance);
  }
  consumeFood(resting);
  checkBatteryDrain();
  updateMood(resting);
  handleFlags();
  maybeLandmark();
  maybeEvent();
  checkEndConditions();
  updateUI();
}

function advanceTime() {
  state.time = new Date(state.time.getTime() + MS_PER_CYCLE);
}

function computeDistance() {
  const pace = paceSettings[state.settings.pace];
  let baseSpeed = pace.speed;
  baseSpeed *= state.weather.mod;
  const avgMood = averageMood();
  if (avgMood < 2) baseSpeed *= 0.95;
  if (state.flags?.speedModCycles > 0) {
    baseSpeed *= state.flags.speedMod || 1;
    state.flags.speedModCycles -= 1;
  }
  return baseSpeed * 0.25;
}

function consumeGas(distance) {
  const pace = paceSettings[state.settings.pace];
  const base = distance / 30;
  const used = base * (1 + pace.gasMod);
  state.inventory.gas = Math.max(0, state.inventory.gas - used);
  if (state.inventory.gas === 0) log('Out of gas! Hope a trade pops up soon.', 'WARN');
}

function consumeFood(resting) {
  const ration = rationSettings[state.settings.rations];
  const perPerson = ration.perHour * 0.25;
  const total = perPerson * state.family.length;
  if (state.inventory.pizza >= total) {
    state.inventory.pizza -= total;
    changeMoodAll(state, 0.2, 'Pizza boost');
  } else {
    changeMoodAll(state, -1.5, 'No food');
  }
  if (resting) {
    changeMoodAll(state, 1, 'Rest stop');
    if (roll(100) < 50) state.skipNext = true; // 50% extra time cost for resting
  }
}

function checkBatteryDrain() {
  ['Calvin', 'Miles'].forEach((name) => {
    if (roll(100) < 50) {
      state.inventory.battery = Math.max(0, state.inventory.battery - 10);
    }
    if (state.inventory.battery <= 0) {
      const member = state.family.find((f) => f.name === name);
      member.ailment = 'BatteryDead';
      changeMood(member, -1, 'Phone battery died');
    }
  });
}

function updateMood(resting) {
  state.family.forEach((member) => {
    const moodVal = member.mood;
    let change = 0;
    if (member.ailment) change -= 1;
    if (state.settings.pace === 'dash' && moodVal < 3) change -= 0.75;
    if (resting) change += 1;
    if (state.flags?.delayedMood) change += state.flags.delayedMood;
    changeMood(member, change, 'Daily mood shift');
    maybeAilment(member);
  });
  if (state.flags?.delayedMood) state.flags.delayedMood = 0;
}

function changeMood(member, delta, reason) {
  member.mood = clamp(member.mood + delta, 0, MOODS.length - 1);
}

function changeMoodAll(s, delta, reason) {
  s.family.forEach((m) => changeMood(m, delta, reason));
}

function boostKids(s, delta) {
  ['Calvin', 'Miles'].forEach((name) => {
    const member = s.family.find((f) => f.name === name);
    changeMood(member, delta, 'Kid vibes');
  });
}

function maybeAilment(member) {
  const chance = 0.1 + 0.05 * (3 - member.mood);
  if (roll(1) < chance) {
    const ailments = ['PizzaWithdrawal', 'CaffeineCrash', 'BatteryDead'];
    member.ailment = ailments[Math.floor(roll(ailments.length))];
    if (!suppressLog) log(`${member.name} suffers ${member.ailment}.`, 'WARN');
  } else if (member.ailment && roll(100) < 10) {
    if (!suppressLog) log(`${member.name} shakes off ${member.ailment}.`, 'INFO');
    member.ailment = null;
  }
}

function averageMood(s = state) {
  const total = s.family.reduce((sum, f) => sum + f.mood, 0);
  return total / s.family.length;
}

function handleFlags() {
  if (state.flags?.pizzaBonus && state.flags.pizzaBonus > 0) {
    // used during next trade/buy; handled in trade()
  }
}

function maybeForgotPresents() {
  if (state.flags?.forgotPresentsHandled) return false;
  if (suppressLog) {
    state.flags = state.flags || {};
    state.flags.forgotPresentsHandled = true;
    return false;
  }
  if (state.goingBack) return false;
  if (state.milesTraveled > 52 && state.milesTraveled < 90) {
    state.flags.forgotPresentsHandled = true;
    openChoiceModal(
      'Forgot the presents!',
      'A few miles past Snoqualmie Pass, someone realizes the presents are still at home. What do you do?',
      'scene-snoqualmie',
      [
        {
          label: 'Turn back to Seattle to fetch the presents',
          effect: (s) => {
            s.goingBack = true;
            s.presents = { mode: 'planned', items: [] };
            log('Turning back to grab the presents.', 'EVENT');
          },
        },
        {
          label: 'Barter with strangers for odd gifts',
          effect: (s) => {
            s.presents = { mode: 'odd', items: [] };
            startBarterForPresents();
          },
        },
      ],
    );
    return true;
  }
  return false;
}

function maybeChangeWeather(s = state) {
  if (roll(100) < 10) {
    s.weather = weatherTable[Math.floor(roll(weatherTable.length))];
  }
}

function maybeLandmark(s = state, skipActions = false) {
  const next = landmarks[s.landmarkIndex];
  if (next && s.milesTraveled >= next.miles) {
    log(`Reached ${next.name}: ${next.text}`, 'INFO');
    s.landmarkIndex += 1;
    changeMoodAll(s, 0.5, `${next.name} stop`);
    if (!skipActions) landmarkActions(next.name);
  }
}

function maybeEvent() {
  if (state.goingBack) return;
  if (state.milesTraveled >= 140 && state.milesTraveled < 150 && !state.flags?.vantageHandled) {
    state.flags = { ...(state.flags || {}), vantageHandled: true };
    triggerVantageConstruction();
    return;
  }
  // Prevent back-to-back of same event
  for (const [id, cd] of eventCooldown.entries()) {
    if (cd > 0) eventCooldown.set(id, cd - 1);
  }
  if (roll(100) > 30) return;
  const eligible = events.filter((e) => e.condition(state) && (eventCooldown.get(e.id) || 0) === 0);
  if (!eligible.length) return;
  const event = weightedPick(eligible);
  triggerEvent(event);
}

function weightedPick(list) {
  const total = list.reduce((s, e) => s + e.probability, 0);
  let r = roll(total);
  for (const e of list) {
    if ((r -= e.probability) <= 0) return e;
  }
  return list[0];
}

function sampleGifts(list, n) {
  const copy = [...list];
  const picks = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(roll(copy.length));
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

function startBarterForPresents() {
  pausedForEvent = true;
  const pool = [...oddGifts, ...oddGiftsExtended];
  const sets = [];
  for (let i = 0; i < 3; i++) {
    const offers = [];
    for (let j = 0; j < 3; j++) {
      const gift = pool.splice(Math.floor(roll(pool.length)), 1)[0];
      const typePick = weightedPick([
        { probability: 35, type: 'pizza' },
        { probability: 35, type: 'cash' },
        { probability: 30, type: 'gas' },
      ]);
      const costType = typePick.type;
      const cost = costType === 'pizza' ? 3 + Math.floor(roll(3)) : costType === 'cash' ? 20 + Math.floor(roll(20)) : 1 + Math.floor(roll(3));
      offers.push({ gift, costType, cost });
    }
    sets.push(offers);
  }
  state.flags.barterSets = sets;
  state.flags.barterIndex = 0;
  showBarterChoice();
}

function showBarterChoice() {
  const sets = state.flags.barterSets || [];
  const idx = state.flags.barterIndex || 0;
  if (idx >= sets.length) {
    state.flags.barterSets = null;
    state.flags.barterIndex = 0;
    hideEvent();
    pausedForEvent = false;
    updateUI();
    return;
  }
  const offers = sets[idx];
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/event-trade.png')`;
  $('event-title').textContent = `Barter for Presents (${idx + 1}/3)`;
  $('event-text').textContent = `Pick one trade for a gift.\nCash: $${state.inventory.cash.toFixed(0)} | Gas: ${state.inventory.gas.toFixed(1)} gal | Pizza: ${state.inventory.pizza.toFixed(0)} slices`;
  const container = $('event-choices');
  container.innerHTML = '';
  offers.forEach((offer, i) => {
    const label = `Trade ${offer.cost} ${offer.costType} for ${offer.gift}`;
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const ok = spendForGift(offer);
      if (ok) state.presents.items.push(offer.gift);
      state.flags.barterIndex = idx + 1;
      showBarterChoice();
    });
    container.appendChild(btn);
  });
  $('event-modal').classList.remove('hidden');
}

function spendForGift(offer) {
  if (offer.costType === 'pizza') {
    if (state.inventory.pizza >= offer.cost) {
      state.inventory.pizza -= offer.cost;
      return true;
    }
  } else if (offer.costType === 'cash') {
    if (state.inventory.cash >= offer.cost) {
      state.inventory.cash -= offer.cost;
      return true;
    }
  } else if (offer.costType === 'gas') {
    if (state.inventory.gas >= offer.cost) {
      state.inventory.gas -= offer.cost;
      return true;
    }
  }
  log('Not enough to trade for that gift.', 'WARN');
  return false;
}

function triggerVantageConstruction() {
  pausedForEvent = true;
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/event-vantage-traffic.png')`;
  $('event-title').textContent = 'Construction Traffic at Vantage';
  $('event-text').textContent = 'Traffic crawls due to construction. What do you do?';
  const container = $('event-choices');
  container.innerHTML = '';
  [
    { label: 'Wait it out (lose a turn)', effect: (s) => { s.skipNext = true; } },
    { label: 'Ford the river as MEN once did', effect: vantageFordSuccess },
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      opt.effect(state);
      if (opt.effect !== vantageFordSuccess) {
        hideEvent();
        pausedForEvent = false;
        updateUI();
      }
    });
    container.appendChild(btn);
  });
  $('event-modal').classList.remove('hidden');
}

function vantageFordSuccess() {
  pausedForEvent = true;
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/event-ford-river.png')`;
  $('event-title').textContent = 'You Forded the River!';
  $('event-text').textContent = 'The Pilot makes it across in glorious retro fashion.';
  const container = $('event-choices');
  container.innerHTML = '';
  const btn = document.createElement('button');
  btn.textContent = 'Keep driving';
  btn.addEventListener('click', () => {
    hideEvent();
    pausedForEvent = false;
    updateUI();
  });
  container.appendChild(btn);
  $('event-modal').classList.remove('hidden');
}

function triggerEvent(event) {
  pausedForEvent = true;
  eventCooldown.set(event.id, 3);
  const art = eventArt[event.id] || 'event-traffic';
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/${art}.png')`;
  $('event-title').textContent = event.name;
  $('event-text').textContent = event.description;
  const container = $('event-choices');
  container.innerHTML = '';
  event.choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.textContent = choice.label;
    btn.addEventListener('click', () => {
      choice.effect(state);
      if (state.flags?.barterSets && state.flags.barterSets.length) {
        // Barter flow manages its own modal progression
        return;
      }
      hideEvent();
      pausedForEvent = false;
      updateUI();
    });
    container.appendChild(btn);
  });
  $('event-modal').classList.remove('hidden');
  log(`Event: ${event.name}`, 'EVENT');
}

function hideEvent() {
  $('event-modal').classList.add('hidden');
  pausedForEvent = false;
}

function detourSuccess(s = state) {
  return 70 - 10 * (3 - averageMood(s));
}

function feedNow() {
  if (state.inventory.pizza <= 0) {
    log('No pizza to eat right now.', 'WARN');
    return;
  }
  const slices = Math.min(4, state.inventory.pizza);
  state.inventory.pizza -= slices;
  changeMoodAll(state, 1, 'Pizza feast');
  updateUI();
}

function trade() {
  const inv = state.inventory;
  const options = [];
  // Generate contextual offers
  if (inv.pizza > 20 && inv.gas < 6) options.push({ give: 'pizza', giveQty: 16, get: 'gas', getQty: 3 });
  if (inv.gas > 8 && inv.cash < 50) options.push({ give: 'gas', giveQty: 2, get: 'cash', getQty: 15 });
  if (inv.cash > 30 && inv.pizza < 16) options.push({ give: 'cash', giveQty: 15, get: 'pizza', getQty: 8 });
  if (inv.cash > 30 && inv.emergencyKits < 2) options.push({ give: 'cash', giveQty: 20, get: 'emergencyKits', getQty: 1 });
  if (options.length === 0) options.push({ give: 'cash', giveQty: 10, get: 'gas', getQty: 1 });

  const bonusPizza = state.flags?.pizzaBonus || 0;
  const choices = options.map((opt) => {
    const takeQty = opt.give === 'pizza' ? opt.giveQty + bonusPizza : opt.giveQty;
    const label = `Give ${takeQty} ${opt.give} → Receive ${opt.getQty} ${opt.get}`;
    return {
      label,
      effect: (s) => {
        if (opt.give === 'cash') {
          if (s.inventory.cash < takeQty) return log('Not enough cash.', 'WARN');
          s.inventory.cash -= takeQty;
        } else {
          if ((s.inventory[opt.give] || 0) < takeQty) return log(`Not enough ${opt.give}.`, 'WARN');
          s.inventory[opt.give] -= takeQty;
        }
        if (opt.get === 'cash') s.inventory.cash += opt.getQty;
        else s.inventory[opt.get] = (s.inventory[opt.get] || 0) + opt.getQty;
        if (bonusPizza && opt.give === 'pizza') s.flags.pizzaBonus = 0;
        log('Trade complete.', 'INFO');
        updateUI();
      },
    };
  });
  choices.push({ label: 'Decline trade', effect: () => {} });

  openChoiceModal(
    'Trade offer',
    `Cash: $${inv.cash.toFixed(0)} | Gas: ${inv.gas.toFixed(1)} gal | Pizza: ${inv.pizza.toFixed(0)} slices | Kits: ${inv.emergencyKits}`,
    'event-trade',
    choices,
  );
}

function checkEndConditions() {
  if (state.milesTraveled >= TOTAL_MILES && state.family.some((f) => f.mood > 0)) {
    const timeStr = state.time.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: true, minute: '2-digit', hour: 'numeric', second: undefined });
    showEnd(`You made it to Spokane at ${timeStr}!`, '', true);
  }
  const allSilent = state.family.every((f) => f.mood <= 0);
  if (allSilent) {
    showEnd('Out of Motivation', 'Nobody has the motivation to keep going.');
  }
  if (state.inventory.gas <= 0) {
    showEnd('Out of Gas', 'The Pilot rolls to a stop with an empty tank.');
  }
  if (state.time > END_TIME) {
    showEnd('Missed Christmas Dinner', 'Grandma started without you.');
  }
}

function computeScore() {
  const happyMembers = state.family.filter((f) => f.mood >= 3).length;
  const base = happyMembers * 50 + state.inventory.pizza * 5 + state.inventory.gas * 10 + state.inventory.snacks * 2 + state.inventory.battery * 1 + state.inventory.emergencyKits * 30;
  const timeBonus = state.time < new Date('2025-12-25T12:00:00Z') ? 100 : 0;
  return Math.round((base + timeBonus) * state.vibe.multiplier);
}

function showEnd(title, body, success = false, imageOverride = null) {
  const ill = $('end-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/${imageOverride || (success ? 'scene-success' : 'scene-gameover')}.png')`;
  const presentsSummary = state.presents.mode === 'planned'
    ? 'Presents: Wrapped gifts from home.'
    : `Presents: ${state.presents.items.join(', ') || 'Random roadside finds.'}`;
  const extra = success ? `Pizza left: ${state.inventory.pizza.toFixed(0)} slices. Gas left: ${state.inventory.gas.toFixed(1)} gal. ${presentsSummary}` : '';
  $('end-title').textContent = title;
  $('end-body').textContent = `${success ? extra : body}`;
  $('end-modal').classList.remove('hidden');
}

function renderFamily() {
  const grid = $('family-grid');
  grid.innerHTML = '';
  state.family.forEach((member) => {
    const div = document.createElement('div');
    div.className = 'member';
  const moodPct = (member.mood / (MOODS.length - 1)) * 100;
  const moodColor = moodPct >= 75 ? '#34d399' : moodPct >= 50 ? '#a3e635' : moodPct >= 25 ? '#fbbf24' : '#f87171';
    const ailmentText = (() => {
      switch (member.ailment) {
        case 'PizzaWithdrawal': return 'Needs pizza.';
        case 'CaffeineCrash': return 'Needs coffee break.';
        case 'PrankBackfire': return 'Prank backfired.';
        case 'BatteryDead': return 'Phone battery dead.';
        default: return '';
      }
    })();
    div.innerHTML = `
      <div class="name">${member.name}</div>
      <div class="mood-bar"><div class="mood-fill" style="width:${moodPct}%;background:${moodColor}"></div></div>
      <div class="ailment">${ailmentText}</div>
    `;
    grid.appendChild(div);
  });
}

function renderScene() {
  const sceneEl = $('scene');
  const captionEl = $('scene-caption');
  if (!sceneEl || !captionEl) return;
  const scene = currentScene();
  sceneEl.style.backgroundImage = `url('assets/${scene.id}.png')`;
  captionEl.textContent = '';
}

function openChoiceModal(title, text, art, choices) {
  pausedForEvent = true;
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/${art}.png')`;
  $('event-title').textContent = title;
  $('event-text').textContent = text;
  const container = $('event-choices');
  container.innerHTML = '';
  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.textContent = choice.label;
    btn.addEventListener('click', () => {
      choice.effect(state);
      if (state.flags?.barterSets && state.flags.barterSets.length) {
        showBarterChoice();
      } else {
        hideEvent();
        pausedForEvent = false;
        updateUI();
      }
    });
    container.appendChild(btn);
  });
  $('event-modal').classList.remove('hidden');
}

function landmarkActions(name) {
  const lower = name.toLowerCase();
  if (lower.includes('snoqualmie')) {
    openChoiceModal(
      'Snowball Fight!',
      'The kids want to pile out for a snowball fight. Do it?',
      'event-snowballfight',
      [
        { label: 'Do the snowball fight (+1 mood, lose next turn)', effect: (s) => { changeMoodAll(s, 1, 'Snowball fight'); s.skipNext = true; } },
        { label: 'Keep driving', effect: () => {} },
      ],
    );
  } else if (lower.includes('cle elum')) {
    openChoiceModal(
      'Pizza Bakery Stop',
      'Grab hot pies while you can.',
      'event-buy-pizza',
      [
        { label: 'Buy 1 pie (8 slices) for $12 (costs time)', effect: (s) => { buyPizza(s, 1, 12); s.skipNext = true; } },
        { label: 'Buy 2 pies (16 slices) for $24 (costs time)', effect: (s) => { buyPizza(s, 2, 24); s.skipNext = true; } },
      ],
    );
  } else if (lower.includes('moses')) {
    openChoiceModal(
      'Gas and Go',
      'Rest stop gas at Moses Lake (a bit pricey). Buy fuel?',
      'event-breakdown',
      [
        { label: 'Buy 5 gallons for $35 (costs time)', effect: (s) => { buyGas(s, 5, 35); s.skipNext = true; } },
        { label: 'Buy 10 gallons for $70 (costs time)', effect: (s) => { buyGas(s, 10, 70); s.skipNext = true; } },
        { label: 'Skip fueling here', effect: () => {} },
      ],
    );
  } else if (lower.includes('sprague')) {
    openChoiceModal(
      'Nap at Sprague Lake',
      'Quiet pullout to rest. Take a nap?',
      'event-wifidrop',
      [
        { label: 'Take a nap (+1 mood, lose next turn)', effect: (s) => { changeMoodAll(s, 1, 'Nap time'); s.skipNext = true; } },
        { label: 'Keep rolling', effect: () => {} },
      ],
    );
  }
}

function buyPizza(s, pies, cost) {
  if (s.inventory.cash < cost) {
    log('Not enough cash for pizza.', 'WARN');
    return;
  }
  s.inventory.cash -= cost;
  s.inventory.pizza = Math.min(1000, s.inventory.pizza + pies * 8); // pies to slices
  log(`Bought ${pies} pies for $${cost}.`, 'INFO');
}

function buyGas(s, gallons, cost) {
  if (s.inventory.cash < cost) {
    log('Not enough cash for gas.', 'WARN');
    return;
  }
  s.inventory.cash -= cost;
  s.inventory.gas = Math.min(MAX_GAS, s.inventory.gas + gallons);
  log(`Bought ${gallons} gallons for $${cost}.`, 'INFO');
  updateUI();
}

function currentScene() {
  let current = sceneArt[0];
  sceneArt.forEach((s) => {
    if (state.milesTraveled >= s.miles) current = s;
  });
  return current;
}

function promptHomeRefuel() {
  pausedForEvent = true;
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/event-buy-gas.png')`;
  $('event-title').textContent = 'Back Home Refill?';
  $('event-text').textContent = `Cash: $${state.inventory.cash.toFixed(0)} — Gas: ${state.inventory.gas.toFixed(1)} gal — Pizza: ${state.inventory.pizza.toFixed(0)} slices. Buy gas before leaving again?`;
  const container = $('event-choices');
  container.innerHTML = '';
  [
    { label: 'Buy 5 gallons for $35', gallons: 5, cost: 35 },
    { label: 'Buy 10 gallons for $70', gallons: 10, cost: 70 },
    { label: 'Skip gas', gallons: 0, cost: 0 },
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      if (opt.cost > 0) buyGas(state, opt.gallons, opt.cost);
      hideEvent();
      pausedForEvent = false;
      updateUI();
    });
    container.appendChild(btn);
  });
  $('event-modal').classList.remove('hidden');
}

function showPresentsReturn() {
  pausedForEvent = true;
  const ill = $('event-illustration');
  if (ill) ill.style.backgroundImage = `url('assets/event-back-home-presents.png')`;
  $('event-title').textContent = 'Presents Retrieved';
  $('event-text').textContent = 'You made it back to Seattle, grabbed the presents, and found $30 for gas.';
  const container = $('event-choices');
  container.innerHTML = '';
  const btn = document.createElement('button');
  btn.textContent = 'Great! Continue';
  btn.addEventListener('click', () => {
    hideEvent();
    pausedForEvent = false;
    promptHomeRefuel();
  });
  container.appendChild(btn);
  $('event-modal').classList.remove('hidden');
}

function updateUI() {
  $('stat-time').textContent = state.time.toLocaleString('en-US', { timeZone: 'UTC', hour12: true });
  $('stat-miles').textContent = `${state.milesTraveled.toFixed(1)} / ${TOTAL_MILES} mi`;
  $('stat-cash').textContent = `$${state.inventory.cash.toFixed(0)}`;
  $('inv-gas').textContent = state.inventory.gas.toFixed(1);
  $('inv-pizza').textContent = state.inventory.pizza.toFixed(0);
  $('inv-battery').textContent = state.inventory.battery.toFixed(0);
  $('inv-kits').textContent = state.inventory.emergencyKits.toFixed(0);
  let pct = (state.milesTraveled / TOTAL_MILES) * 100;
  if (!Number.isFinite(pct)) pct = 0;
  pct = Math.min(100, Math.max(0, pct));
  $('progress-fill').style.width = `${pct}%`;
  const next = landmarks[state.landmarkIndex];
  $('landmark-next').textContent = next ? `${next.name} in ${(next.miles - state.milesTraveled).toFixed(0)} miles` : 'Grandma\'s house ahead!';
  document.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b.dataset.pace === state.settings.pace));
  document.querySelectorAll('[data-rations]').forEach((b) => b.classList.toggle('active', b.dataset.rations === state.settings.rations));
  renderFamily();
  renderScene();
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function log(message, tag = 'INFO') {
  if (suppressLog) return;
  const feed = $('log-feed');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const t = new Date(state.time);
  entry.innerHTML = `<span class="time">${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' })}</span><span class="tag">[${tag}]</span>${message}`;
  feed.prepend(entry);
  const maxEntries = 50;
  while (feed.children.length > maxEntries) {
    feed.removeChild(feed.lastChild);
  }
}

// ---------------------
// Auto simulation helper (headless balance testing)
// ---------------------
function simulateRuns(options = {}) {
  const runs = options.runs || 50;
  const strategy = options.strategy || 'balanced';
  const results = [];
  suppressLog = true;
  for (let i = 0; i < runs; i++) {
    const sim = createSimState(options);
    const cooldown = new Map();
  let cycles = 0;
  let reason = '';
  while (!endCondition(sim) && cycles < 600) {
    const act = chooseAction(sim, strategy);
    simTick(sim, act, cooldown);
    cycles += 1;
    }
    if (sim.milesTraveled >= TOTAL_MILES && sim.family.some((f) => f.mood > 0) && sim.time <= END_TIME) {
      reason = 'Arrived';
    } else if (sim.family.every((f) => f.mood <= 0)) {
      reason = 'Mood collapse';
    } else if (sim.inventory.gas <= 0 && sim.inventory.cash <= 0) {
      reason = 'Stranded';
    } else if (sim.time > END_TIME) {
      reason = 'Late';
    } else {
      reason = 'Other';
    }
    results.push({
      success: reason === 'Arrived',
      reason,
      miles: sim.milesTraveled,
      pizza: sim.inventory.pizza,
      gas: sim.inventory.gas,
      cash: sim.inventory.cash,
      mood: averageMood(sim),
      time: sim.time,
    });
  }
  suppressLog = false;
  return summarizeResults(results);
}

function createSimState(options) {
  const vibeKey = options.vibe || 'budget';
  const vibe = vibes[vibeKey] || vibes.budget;
  const inv = {
    gas: options.gas ?? 15,
    pizza: options.pizza ?? 60,
    snacks: options.snacks ?? 12,
    battery: options.battery ?? 80,
    emergencyKits: options.kits ?? 2,
    cash: options.cash ?? vibe.budget - 200,
  };
  return {
    vibe,
    time: new Date(START_TIME),
    milesTraveled: 0,
    landmarkIndex: 0,
    weather: weatherTable[0],
    family: [
      { name: 'Will', mood: 3, ailment: null },
      { name: 'Michelle', mood: 3, ailment: null },
      { name: 'Calvin', mood: 3, ailment: null },
      { name: 'Miles', mood: 3, ailment: null },
    ],
    inventory: inv,
    settings: { pace: options.pace || 'cruise', rations: options.rations || 'sip' },
    flags: {},
    skipNext: false,
    presents: { mode: 'planned', items: [] },
    goingBack: false,
  };
}

function chooseAction(sim, strategy) {
  const mood = averageMood(sim);
  if (strategy === 'cautious') {
    if (mood < 1.5 || sim.inventory.pizza < 10) return 'rest';
    return 'drive';
  }
  if (strategy === 'reckless') return 'drive';
  if (mood < 1) return 'rest';
  return 'drive';
}

function simTick(sim, action, cooldown) {
  advanceTimeSim(sim);
  maybeChangeWeather(sim);
  if (sim.skipNext) {
    sim.skipNext = false;
    return;
  }
  let distance = 0;
  if (action === 'drive') {
    distance = computeDistanceSim(sim);
    sim.milesTraveled = Math.min(TOTAL_MILES, sim.milesTraveled + distance);
    consumeGasSim(sim, distance);
  } else {
    changeMoodAll(sim, 1, 'Rest');
    if (roll(100) < 50) sim.skipNext = true;
  }
  consumeFoodSim(sim);
  checkBatteryDrainSim(sim);
  updateMoodSim(sim, action === 'rest');
  handleFlagsSim(sim);
  maybeLandmark(sim, true);
  maybeEventSim(sim, cooldown);
}

function advanceTimeSim(sim) {
  sim.time = new Date(sim.time.getTime() + MS_PER_CYCLE);
}

function computeDistanceSim(sim) {
  const pace = paceSettings[sim.settings.pace];
  let baseSpeed = pace.speed;
  baseSpeed *= sim.weather.mod;
  const avgMood = averageMood(sim);
  if (avgMood < 2) baseSpeed *= 0.95;
  if (sim.flags?.speedModCycles > 0) {
    baseSpeed *= sim.flags.speedMod || 1;
    sim.flags.speedModCycles -= 1;
  }
  return baseSpeed * 0.25;
}

function consumeGasSim(sim, distance) {
  const pace = paceSettings[sim.settings.pace];
  const base = distance / 30;
  const used = base * (1 + pace.gasMod);
  sim.inventory.gas = Math.max(0, sim.inventory.gas - used);
}

function consumeFoodSim(sim) {
  const ration = rationSettings[sim.settings.rations];
  const perPerson = ration.perHour * 0.25;
  const total = perPerson * sim.family.length;
  if (sim.inventory.pizza >= total) {
    sim.inventory.pizza -= total;
  } else {
    changeMoodAll(sim, -1.5, 'No food');
  }
}

function checkBatteryDrainSim(sim) {
  ['Calvin', 'Miles'].forEach((name) => {
    if (roll(100) < 50) {
      sim.inventory.battery = Math.max(0, sim.inventory.battery - 10);
    }
    if (sim.inventory.battery <= 0) {
      const member = sim.family.find((f) => f.name === name);
      member.ailment = 'BatteryDead';
      changeMood(member, -1, 'Phone battery died');
    }
  });
}

function updateMoodSim(sim, resting) {
  sim.family.forEach((member) => {
    let change = 0;
    if (member.ailment) change -= 1;
    if (sim.settings.pace === 'dash' && member.mood < 3) change -= 0.75;
    if (resting) change += 1;
    if (sim.flags?.delayedMood) change += sim.flags.delayedMood;
    changeMood(member, change, 'Daily mood shift');
    maybeAilment(member);
  });
  if (sim.flags?.delayedMood) sim.flags.delayedMood = 0;
}

function handleFlagsSim(sim) {
  if (sim.flags?.pizzaBonus && sim.flags.pizzaBonus > 0) {
    // consumed when used
  }
}

function maybeEventSim(sim, cooldown) {
  for (const [id, cd] of cooldown.entries()) {
    if (cd > 0) cooldown.set(id, cd - 1);
  }
  if (roll(100) > 30) return;
  const eligible = events.filter((e) => e.condition(sim) && (cooldown.get(e.id) || 0) === 0);
  if (!eligible.length) return;
  const event = weightedPick(eligible);
  cooldown.set(event.id, 3);
  const choice = event.choices[0];
  choice.effect(sim);
}

function endCondition(sim) {
  if (sim.milesTraveled >= TOTAL_MILES && sim.family.some((f) => f.mood > 0)) return true;
  if (sim.family.every((f) => f.mood <= 0)) return true;
  if (sim.inventory.gas <= 0 && sim.inventory.cash <= 0) return true;
  if (sim.time > END_TIME) return true;
  return false;
}

function summarizeResults(results) {
  const successCount = results.filter((r) => r.success).length;
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const miles = avg(results.map((r) => r.miles));
  const pizza = avg(results.map((r) => r.pizza));
  const gas = avg(results.map((r) => r.gas));
  const mood = avg(results.map((r) => r.mood));
  const reasons = results.reduce((acc, r) => {
    acc[r.reason] = (acc[r.reason] || 0) + 1;
    return acc;
  }, {});
  return {
    runs: results.length,
    successRate: (successCount / results.length) * 100,
    avgMiles: miles,
    avgPizza: pizza,
    avgGas: gas,
    avgMood: mood,
    reasons,
  };
}

if (typeof window !== 'undefined') {
  window.simulateRuns = simulateRuns;
}

init();
