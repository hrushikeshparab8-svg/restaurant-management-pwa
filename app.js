const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
const money = v => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0,10);
const monthStartISO = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);

let menuItems = [];
let currentRole = "staff";

document.querySelectorAll('input[type="date"]').forEach(i => i.value = todayISO());

function objFromForm(form) {
  const obj = Object.fromEntries(new FormData(form).entries());
  Object.keys(obj).forEach(k => { if (obj[k] === "") obj[k] = null; });
  return obj;
}

async function getUser() {
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  return data.user;
}

async function ensureProfile() {
  const user = await getUser();
  let { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) {
    await db.from("profiles").insert({ id: user.id, full_name: user.email, role: "staff" });
    data = { role: "staff", full_name: user.email };
  }
  currentRole = data.role || "staff";
  $("userRoleBox").innerHTML = `Logged in as <b>${user.email}</b><br>Role: <b>${currentRole}</b>`;
  document.querySelectorAll("[data-admin-only='true']").forEach(el => {
    el.classList.toggle("hidden", currentRole !== "admin");
  });
}

async function checkSession() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    $("logoutBtn").classList.add("hidden");
    return;
  }

  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  await ensureProfile();
  await loadAll();
}

$("loginBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return $("authMessage").textContent = error.message;
  $("authMessage").textContent = "";
  await checkSession();
};

$("signupBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await db.auth.signUp({ email, password });
  $("authMessage").textContent = error ? error.message : "Account created. Confirm email if Supabase asks, then login.";
};

$("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  await checkSession();
};

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  };
});

async function loadMenu() {
  const { data, error } = await db.from("menu_items").select("*").eq("active", true).order("name");
  if (error) {
    menuItems = [
      { name: "Chicken Biryani", default_selling_price: 120, default_plate_cost: 0 },
      { name: "Veg Biryani", default_selling_price: 100, default_plate_cost: 0 },
      { name: "Veg Thali", default_selling_price: 120, default_plate_cost: 0 },
      { name: "Bangda Thali", default_selling_price: 150, default_plate_cost: 0 },
      { name: "Fish Thali", default_selling_price: 150, default_plate_cost: 0 },
      { name: "Prawns Thali", default_selling_price: 180, default_plate_cost: 0 },
      { name: "King Fish Thali", default_selling_price: 220, default_plate_cost: 0 },
      { name: "Ros Omelette", default_selling_price: 80, default_plate_cost: 0 },
      { name: "Tea", default_selling_price: 20, default_plate_cost: 0 },
      { name: "Cold Drink", default_selling_price: 40, default_plate_cost: 0 }
    ];
  } else {
    menuItems = data || [];
  }

  const options = `<option value="">Select menu item</option>` + menuItems.map(i => `<option value="${i.name}">${i.name}</option>`).join("");
  $("salesMenuSelect").innerHTML = options;
  $("sopMenuSelect").innerHTML = options;
}

function selectedMenuItem(name) {
  return menuItems.find(i => i.name === name) || {};
}

$("salesMenuSelect").addEventListener("change", () => {
  const item = selectedMenuItem($("salesMenuSelect").value);
  $("salePrice").value = item.default_selling_price || "";
  updateSalesPreview();
});

["salePrice"].forEach(id => $(id).addEventListener("input", updateSalesPreview));
document.querySelector('#salesForm input[name="quantity"]').addEventListener("input", updateSalesPreview);

function updateSalesPreview() {
  const form = $("salesForm");
  const item = selectedMenuItem($("salesMenuSelect").value);
  const qty = Number(form.quantity.value || 0);
  const price = Number(form.selling_price.value || 0);
  const cost = Number(item.default_plate_cost || 0);
  $("salesTotalPreview").textContent = money(qty * price);
  $("plateCostPreview").textContent = money(cost);
}

document.querySelector('#expensesForm input[name="quantity"]').addEventListener("input", updateRatePreview);
$("buyingPrice").addEventListener("input", updateRatePreview);
function updateRatePreview() {
  const form = $("expensesForm");
  const qty = Number(form.quantity.value || 0);
  const price = Number(form.total_price.value || 0);
  $("ratePreview").textContent = qty ? money(price / qty) : money(0);
}

$("salesForm").onsubmit = async e => {
  e.preventDefault();
  const user = await getUser();
  const obj = objFromForm(e.target);
  const menu = selectedMenuItem(obj.item_name);
  obj.user_id = user.id;
  obj.quantity = Number(obj.quantity || 0);
  obj.selling_price = Number(obj.selling_price || 0);
  obj.plate_cost = Number(menu.default_plate_cost || 0);
  obj.total_food_cost = obj.quantity * obj.plate_cost;
  obj.gross_profit = (obj.quantity * obj.selling_price) - obj.total_food_cost;

  const { error } = await db.from("sales").insert(obj);
  if (error) return alert(error.message);

  e.target.reset();
  document.querySelector('#salesForm input[type="date"]').value = todayISO();
  updateSalesPreview();
  await loadAll();
  alert("Sale saved.");
};

$("expensesForm").onsubmit = async e => {
  e.preventDefault();
  const user = await getUser();
  const obj = objFromForm(e.target);
  obj.user_id = user.id;
  obj.quantity = Number(obj.quantity || 0);
  obj.total_price = Number(obj.total_price || 0);
  obj.buying_price = obj.total_price;

  const { error } = await db.from("expenses").insert(obj);
  if (error) return alert(error.message);

  e.target.reset();
  document.querySelector('#expensesForm input[type="date"]').value = todayISO();
  updateRatePreview();
  await loadAll();
  alert("Expense saved and inventory updated.");
};

function parseIngredients(text) {
  return (text || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(x => x.trim());
    return {
      ingredient_name: parts[0],
      quantity_required: Number(parts[1] || 0),
      unit: parts[2] || "kg",
      ingredient_price: Number(parts[3] || 0)
    };
  }).filter(i => i.ingredient_name && i.quantity_required > 0);
}

$("sopForm").onsubmit = async e => {
  e.preventDefault();
  const obj = objFromForm(e.target);
  const ingredients = parseIngredients(obj.ingredients_text);
  const totalCost = ingredients.reduce((sum, i) => sum + (i.quantity_required * i.ingredient_price), 0);
  const plates = Number(obj.plates_produced || 0);
  const selling = Number(obj.selling_price || 0);
  const costPerPlate = plates ? totalCost / plates : 0;
  const profitPerPlate = selling - costPerPlate;

  const recipePayload = {
    menu_item_name: obj.menu_item_name,
    selling_price: selling,
    quantity_prepared: Number(obj.quantity_prepared || 0),
    plates_produced: plates,
    total_recipe_cost: totalCost,
    cost_per_plate: costPerPlate,
    profit_per_plate: profitPerPlate,
    preparation_steps: obj.preparation_steps,
    hygiene_instructions: obj.hygiene_instructions,
    portion_size: obj.portion_size,
    plating_instructions: obj.plating_instructions,
    storage_instructions: obj.storage_instructions
  };

  const { data: recipe, error } = await db.from("sop_recipes").insert(recipePayload).select().single();
  if (error) return alert(error.message);

  const ingredientRows = ingredients.map(i => ({ ...i, recipe_id: recipe.id }));
  if (ingredientRows.length) {
    const { error: ingErr } = await db.from("sop_ingredients").insert(ingredientRows);
    if (ingErr) return alert(ingErr.message);
  }

  await db.from("recipe_preparations").insert({
    recipe_id: recipe.id,
    menu_item_name: obj.menu_item_name,
    plates_prepared: plates,
    total_cost: totalCost,
    cost_per_plate: costPerPlate
  });

  for (const ing of ingredients) {
    await reduceInventory(ing.ingredient_name, ing.quantity_required, ing.unit, recipe.id);
  }

  await db.from("menu_items").upsert({
    name: obj.menu_item_name,
    default_selling_price: selling,
    default_plate_cost: costPerPlate,
    active: true
  }, { onConflict: "name" });

  e.target.reset();
  await loadAll();
  alert("SOP saved, plate cost calculated, and inventory adjusted.");
};

async function reduceInventory(itemName, qty, unit, recipeId) {
  const { data } = await db.from("inventory").select("*").ilike("raw_material_name", itemName).limit(1).maybeSingle();
  if (data) {
    await db.from("inventory").update({ stock_used: Number(data.stock_used || 0) + qty }).eq("id", data.id);
  } else {
    await db.from("inventory").insert({
      raw_material_name: itemName,
      category: "Raw Material",
      unit,
      opening_stock: 0,
      stock_added: 0,
      stock_used: qty,
      minimum_stock_level: 0
    });
  }

  await db.from("inventory_transactions").insert({
    item_name: itemName,
    category: "Raw Material",
    unit,
    transaction_type: "recipe_use",
    quantity: qty,
    amount: 0,
    reference_table: "sop_recipes",
    reference_id: recipeId
  });
}

$("refreshBtn").onclick = () => loadAll();

async function loadAll() {
  await loadMenu();
  await Promise.all([loadDashboard(), loadSales(), loadExpenses(), loadInventory(), loadSOP(), loadReports()]);
}

async function loadDashboard() {
  const today = todayISO();
  const start = monthStartISO();
  const [{ data: sToday }, { data: eToday }, { data: sMonth }, { data: eMonth }, { data: inv }, { data: recipes }] = await Promise.all([
    db.from("sales").select("*").eq("sale_date", today),
    db.from("expenses").select("*").eq("expense_date", today),
    db.from("sales").select("*").gte("sale_date", start),
    db.from("expenses").select("*").gte("expense_date", start),
    db.from("inventory").select("*").order("raw_material_name"),
    db.from("sop_recipes").select("*").order("created_at", { ascending: false })
  ]);

  const salesToday = sum(sToday, "total_amount");
  const expensesToday = sum(eToday, "total_price");
  const foodCostToday = sum(sToday, "total_food_cost");
  const salesMonth = sum(sMonth, "total_amount");
  const expensesMonth = sum(eMonth, "total_price");
  const foodCostMonth = sum(sMonth, "total_food_cost");
  const low = (inv || []).filter(i => Number(i.closing_stock || 0) <= Number(i.minimum_stock_level || 0));

  $("todaySales").textContent = money(salesToday);
  $("todayExpenses").textContent = money(expensesToday);
  $("todayFoodCost").textContent = money(foodCostToday);
  $("todayNetProfit").textContent = money(salesToday - foodCostToday - expensesToday);
  $("monthSales").textContent = money(salesMonth);
  $("monthExpenses").textContent = money(expensesMonth);
  $("monthProfit").textContent = money(salesMonth - foodCostMonth - expensesMonth);
  $("lowStockCount").textContent = low.length;

  renderLowStock(low);
  renderTopSelling(sToday || []);
  renderProfitDiff(recipes || []);
  renderExpensive(eToday || []);
}

function sum(rows, key) {
  return (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
}

function renderLowStock(rows) {
  $("lowStockList").innerHTML = rows.length ? rows.map(i => `<div class="list-item"><strong>${i.raw_material_name}</strong><div class="meta"><span class="pill red">LOW</span> Closing ${i.closing_stock} ${i.unit || ""} | Minimum ${i.minimum_stock_level}</div></div>`).join("") : `<div class="list-item"><strong>No low-stock items</strong><div class="meta">Inventory is above minimum level.</div></div>`;
}

function renderTopSelling(rows) {
  const map = {};
  rows.forEach(r => {
    map[r.item_name] = map[r.item_name] || { qty: 0, amount: 0, profit: 0 };
    map[r.item_name].qty += Number(r.quantity || 0);
    map[r.item_name].amount += Number(r.total_amount || 0);
    map[r.item_name].profit += Number(r.gross_profit || 0);
  });
  const list = Object.entries(map).sort((a,b) => b[1].qty - a[1].qty);
  $("topSellingList").innerHTML = list.length ? list.map(([name, v]) => `<div class="list-item"><strong>${name}</strong><div class="meta">Qty: ${v.qty} | Sales: ${money(v.amount)} | Plate Profit: ${money(v.profit)}</div></div>`).join("") : `<div class="list-item">No sales today.</div>`;
}

function renderProfitDiff(recipes) {
  const latest = {};
  recipes.forEach(r => { if (!latest[r.menu_item_name]) latest[r.menu_item_name] = r; });
  const list = Object.values(latest);
  $("profitDiffList").innerHTML = list.length ? list.map(r => `<div class="list-item"><strong>${r.menu_item_name}</strong><div class="meta"><span class="pill orange">Cost ${money(r.cost_per_plate)}</span><span class="pill">Sell ${money(r.selling_price)}</span> Profit / plate: <b>${money(r.profit_per_plate)}</b></div></div>`).join("") : `<div class="list-item">Add SOP recipes to see cost per plate.</div>`;
}

function renderExpensive(rows) {
  const list = [...rows].sort((a,b) => Number(b.total_price || 0) - Number(a.total_price || 0)).slice(0,8);
  $("expensiveItemsList").innerHTML = list.length ? list.map(r => `<div class="list-item"><strong>${r.item_name} - ${money(r.total_price)}</strong><div class="meta">${r.category || ""} | Qty ${r.quantity || "-"} ${r.unit || ""} | Supplier ${r.supplier || "-"}</div></div>`).join("") : `<div class="list-item">No expenses today.</div>`;
}

async function loadSales() {
  const { data, error } = await db.from("sales").select("*").order("sale_date", { ascending:false }).order("id", { ascending:false }).limit(20);
  $("salesList").innerHTML = error ? `<div class="list-item">${error.message}</div>` :
    data.length ? data.map(r => `<div class="list-item"><strong>${r.item_name} - ${money(r.total_amount)}</strong><div class="meta">${r.sale_date} | Qty ${r.quantity} | Price ${money(r.selling_price)} | Food cost ${money(r.total_food_cost)} | Profit ${money(r.gross_profit)} | ${r.payment_mode}</div></div>`).join("") : `<div class="list-item">No sales added yet.</div>`;
}

async function loadExpenses() {
  const { data, error } = await db.from("expenses").select("*").order("expense_date", { ascending:false }).order("id", { ascending:false }).limit(20);
  $("expensesList").innerHTML = error ? `<div class="list-item">${error.message}</div>` :
    data.length ? data.map(r => `<div class="list-item"><strong>${r.item_name} - ${money(r.total_price)}</strong><div class="meta">${r.expense_date} | ${r.category} | Qty ${r.quantity || "-"} ${r.unit || ""} | Rate ${r.price_per_unit ? money(r.price_per_unit) : "-"} | Supplier ${r.supplier || "-"}</div></div>`).join("") : `<div class="list-item">No expenses added yet.</div>`;
}

async function loadInventory() {
  const { data, error } = await db.from("inventory").select("*").order("raw_material_name");
  $("inventoryList").innerHTML = error ? `<div class="list-item">${error.message}</div>` :
    data.length ? data.map(r => `<div class="list-item"><strong>${r.raw_material_name}</strong><div class="meta"><span class="pill">${r.category || "-"}</span> Unit ${r.unit || "-"} | Opening ${r.opening_stock} | Added ${r.stock_added} | Used ${r.stock_used} | Closing <b>${r.closing_stock}</b> | Min ${r.minimum_stock_level} | Last ${money(r.last_purchase_price)} | Avg ${money(r.average_purchase_price)}</div></div>`).join("") : `<div class="list-item">No inventory added yet. Add expenses first.</div>`;
}

async function loadSOP() {
  const { data, error } = await db.from("sop_recipes").select("*").order("created_at", { ascending:false }).limit(20);
  $("sopList").innerHTML = error ? `<div class="list-item">${error.message}</div>` :
    data.length ? data.map(r => `<div class="list-item"><strong>${r.menu_item_name}</strong><div class="meta">Prepared ${r.quantity_prepared || 0} | Plates ${r.plates_produced} | Total cost ${money(r.total_recipe_cost)} | Cost/plate ${money(r.cost_per_plate)} | Sell ${money(r.selling_price)} | Profit/plate ${money(r.profit_per_plate)}</div></div>`).join("") : `<div class="list-item">No SOP recipes added yet.</div>`;
}

async function loadReports() {
  const today = todayISO();
  const start = monthStartISO();
  const [{ data: sToday }, { data: eToday }, { data: sMonth }, { data: eMonth }] = await Promise.all([
    db.from("sales").select("*").eq("sale_date", today),
    db.from("expenses").select("*").eq("expense_date", today),
    db.from("sales").select("*").gte("sale_date", start),
    db.from("expenses").select("*").gte("expense_date", start)
  ]);

  const dSales = sum(sToday, "total_amount");
  const dExp = sum(eToday, "total_price");
  const dCost = sum(sToday, "total_food_cost");
  const mSales = sum(sMonth, "total_amount");
  const mExp = sum(eMonth, "total_price");
  const mCost = sum(sMonth, "total_food_cost");

  $("reportDailySales").textContent = money(dSales);
  $("reportDailyExpenses").textContent = money(dExp);
  $("reportDailyProfit").textContent = money(dSales - dCost - dExp);
  $("reportMonthlySales").textContent = money(mSales);
  $("reportMonthlyExpenses").textContent = money(mExp);
  $("reportMonthlyProfit").textContent = money(mSales - mCost - mExp);

  renderItemProfitReport(sMonth || []);
  renderPaymentReport(sMonth || []);
}

function renderItemProfitReport(rows) {
  const map = {};
  rows.forEach(r => {
    map[r.item_name] = map[r.item_name] || { qty:0, sales:0, food:0, profit:0 };
    map[r.item_name].qty += Number(r.quantity || 0);
    map[r.item_name].sales += Number(r.total_amount || 0);
    map[r.item_name].food += Number(r.total_food_cost || 0);
    map[r.item_name].profit += Number(r.gross_profit || 0);
  });
  const list = Object.entries(map).sort((a,b) => b[1].sales - a[1].sales);
  $("itemProfitReport").innerHTML = list.length ? list.map(([name,v]) => `<div class="list-item"><strong>${name}</strong><div class="meta">Qty ${v.qty} | Sales ${money(v.sales)} | Plate cost ${money(v.food)} | Gross profit ${money(v.profit)}</div></div>`).join("") : `<div class="list-item">No monthly sales yet.</div>`;
}

function renderPaymentReport(rows) {
  const map = {};
  rows.forEach(r => {
    map[r.payment_mode] = map[r.payment_mode] || { count:0, amount:0 };
    map[r.payment_mode].count += 1;
    map[r.payment_mode].amount += Number(r.total_amount || 0);
  });
  const list = Object.entries(map).sort((a,b) => b[1].amount - a[1].amount);
  $("paymentReport").innerHTML = list.length ? list.map(([mode,v]) => `<div class="list-item"><strong>${mode}</strong><div class="meta">Entries ${v.count} | Amount ${money(v.amount)}</div></div>`).join("") : `<div class="list-item">No payment data yet.</div>`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

checkSession();
