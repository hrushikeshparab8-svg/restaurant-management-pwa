const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const el = (id) => document.getElementById(id);
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

document.querySelectorAll('input[type="date"]').forEach(input => {
  input.value = todayISO();
});

async function showMessage(message) {
  el("authMessage").textContent = message || "";
}

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    el("authView").classList.add("hidden");
    el("appView").classList.remove("hidden");
    el("logoutBtn").classList.remove("hidden");
    await loadAll();
  } else {
    el("authView").classList.remove("hidden");
    el("appView").classList.add("hidden");
    el("logoutBtn").classList.add("hidden");
  }
}

el("loginBtn").addEventListener("click", async () => {
  const email = el("email").value.trim();
  const password = el("password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return showMessage(error.message);

  showMessage("");
  await checkSession();
});

el("signupBtn").addEventListener("click", async () => {
  const email = el("email").value.trim();
  const password = el("password").value;

  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return showMessage(error.message);

  showMessage("Account created. If email confirmation is enabled, confirm your email before login.");
});

el("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  await checkSession();
});

document.querySelectorAll(".tabs button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.tab).classList.add("active");
  });
});

function formDataToObject(form) {
  const data = new FormData(form);
  const obj = Object.fromEntries(data.entries());

  for (const key of Object.keys(obj)) {
    if (obj[key] === "") obj[key] = null;
  }

  return obj;
}

async function currentUserId() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  return data.user.id;
}

el("salesForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const obj = formDataToObject(e.target);
  obj.user_id = await currentUserId();
  obj.quantity = Number(obj.quantity);
  obj.selling_price = Number(obj.selling_price);

  const { error } = await supabaseClient.from("sales").insert(obj);
  if (error) return alert(error.message);

  e.target.reset();
  document.querySelector('#salesForm input[type="date"]').value = todayISO();
  await loadAll();
  alert("Sale saved.");
});

el("expensesForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const obj = formDataToObject(e.target);
  obj.user_id = await currentUserId();
  obj.quantity = obj.quantity ? Number(obj.quantity) : null;
  obj.total_price = Number(obj.total_price);

  const { error } = await supabaseClient.from("expenses").insert(obj);
  if (error) return alert(error.message);

  e.target.reset();
  document.querySelector('#expensesForm input[type="date"]').value = todayISO();
  await loadAll();
  alert("Expense saved.");
});

el("inventoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const obj = formDataToObject(e.target);

  obj.opening_stock = Number(obj.opening_stock);
  obj.stock_added = Number(obj.stock_added);
  obj.stock_used = Number(obj.stock_used);
  obj.minimum_stock_level = Number(obj.minimum_stock_level);
  obj.purchase_price = obj.purchase_price ? Number(obj.purchase_price) : null;

  const { error } = await supabaseClient.from("inventory").insert(obj);
  if (error) return alert(error.message);

  e.target.reset();
  await loadAll();
  alert("Inventory saved.");
});

el("refreshBtn").addEventListener("click", loadAll);

async function loadAll() {
  await Promise.all([
    loadDashboard(),
    loadSales(),
    loadExpenses(),
    loadInventory(),
    loadReports()
  ]);
}

async function loadDashboard() {
  const today = todayISO();

  const [{ data: sales }, { data: expenses }, { data: inventory }] = await Promise.all([
    supabaseClient.from("sales").select("total_amount").eq("sale_date", today),
    supabaseClient.from("expenses").select("total_price").eq("expense_date", today),
    supabaseClient.from("inventory").select("*").order("id", { ascending: false })
  ]);

  const salesTotal = (sales || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const expensesTotal = (expenses || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0);
  const lowStock = (inventory || []).filter(row => Number(row.closing_stock || 0) <= Number(row.minimum_stock_level || 0));

  el("todaySales").textContent = money(salesTotal);
  el("todayExpenses").textContent = money(expensesTotal);
  el("todayProfit").textContent = money(salesTotal - expensesTotal);
  el("lowStockCount").textContent = lowStock.length;

  el("lowStockList").innerHTML = lowStock.length
    ? lowStock.map(item => `
      <div class="list-item">
        <strong>${item.raw_material_name}</strong>
        <div class="meta">Closing: ${item.closing_stock} ${item.unit} | Minimum: ${item.minimum_stock_level} ${item.unit}</div>
      </div>
    `).join("")
    : `<div class="list-item"><strong>No low-stock items</strong><div class="meta">Inventory looks okay.</div></div>`;
}

async function loadSales() {
  const { data, error } = await supabaseClient
    .from("sales")
    .select("*")
    .order("sale_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);

  if (error) {
    el("salesList").innerHTML = `<div class="list-item">${error.message}</div>`;
    return;
  }

  el("salesList").innerHTML = data.length
    ? data.map(row => `
      <div class="list-item">
        <strong>${row.item_name} - ${money(row.total_amount)}</strong>
        <div class="meta">${row.sale_date} | Qty: ${row.quantity} | Price: ${money(row.selling_price)} | ${row.payment_mode}</div>
      </div>
    `).join("")
    : `<div class="list-item">No sales added yet.</div>`;
}

async function loadExpenses() {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);

  if (error) {
    el("expensesList").innerHTML = `<div class="list-item">${error.message}</div>`;
    return;
  }

  el("expensesList").innerHTML = data.length
    ? data.map(row => `
      <div class="list-item">
        <strong>${row.item_name} - ${money(row.total_price)}</strong>
        <div class="meta">${row.expense_date} | ${row.category} | Qty: ${row.quantity || "-"} | Rate: ${row.price_per_unit ? money(row.price_per_unit) : "-"} | Supplier: ${row.supplier || "-"}</div>
      </div>
    `).join("")
    : `<div class="list-item">No expenses added yet.</div>`;
}

async function loadInventory() {
  const { data, error } = await supabaseClient
    .from("inventory")
    .select("*")
    .order("id", { ascending: false })
    .limit(30);

  if (error) {
    el("inventoryList").innerHTML = `<div class="list-item">${error.message}</div>`;
    return;
  }

  el("inventoryList").innerHTML = data.length
    ? data.map(row => `
      <div class="list-item">
        <strong>${row.raw_material_name}</strong>
        <div class="meta">
          Closing: ${row.closing_stock} ${row.unit} |
          Added: ${row.stock_added} |
          Used: ${row.stock_used} |
          Min: ${row.minimum_stock_level} |
          Price: ${row.purchase_price ? money(row.purchase_price) : "-"}
        </div>
      </div>
    `).join("")
    : `<div class="list-item">No inventory added yet.</div>`;
}

async function loadReports() {
  const start = monthStartISO();

  const [{ data: sales }, { data: expenses }] = await Promise.all([
    supabaseClient.from("sales").select("total_amount").gte("sale_date", start),
    supabaseClient.from("expenses").select("total_price").gte("expense_date", start)
  ]);

  const salesTotal = (sales || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const expensesTotal = (expenses || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0);

  el("monthSales").textContent = money(salesTotal);
  el("monthExpenses").textContent = money(expensesTotal);
  el("monthProfit").textContent = money(salesTotal - expensesTotal);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

checkSession();
