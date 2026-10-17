document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { TIME_ZONE, normalizeTimes, nextLabel } = MedTechSchedule;
  const status = $('pageStatus');
  let user, client, saved = null, saving = false, pairing = false, statusPending = false;
  let refreshTimer;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function readableError(error) {
    if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)) {
      return 'O cadastro precisa ser ativado no Supabase. Execute o arquivo supabase/medtech-agenda.sql e recarregue a página.';
    }
    return 'Não foi possível concluir. Confira sua conexão e tente novamente. Seus dados preenchidos continuam aqui.';
  }
  function updateTimeButtons() {
    const rows = [...$('timeFields').children];
    rows.forEach((row, index) => {
      const label = row.querySelector('label');
      const input = row.querySelector('input');
      input.id = `schedule-time-${index}`;
      label.htmlFor = input.id;
      label.textContent = `Horário ${index + 1}`;
      const remove = row.querySelector('button');
      remove.disabled = rows.length === 1;
      remove.setAttribute('aria-label', `Remover horário ${index + 1}`);
    });
    $('addTime').disabled = rows.length >= 12;
  }
  function addTime(value = '', focus = false) {
    if ($('timeFields').children.length >= 12) return;
    const row = document.createElement('div');
    row.className = 'time-row';
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'time'; input.required = true; input.step = '60'; input.value = value;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-time'; remove.textContent = 'Remover';
    remove.onclick = () => { row.remove(); updateTimeButtons(); };
    wrap.append(label, input); row.append(wrap, remove); $('timeFields').append(row);
    updateTimeButtons();
    if (focus) input.focus();
  }
  function renderSaved() {
    $('savedTimes').replaceChildren();
    if (!saved) {
      $('savedTitle').textContent = 'Nenhum remédio cadastrado';
      $('nextSchedule').textContent = 'Salve sua primeira programação para começar.';
      return;
    }
    $('savedTitle').textContent = saved.medicine_name;
    saved.times.forEach(time => {
      const chip = document.createElement('span'); chip.textContent = time; $('savedTimes').append(chip);
    });
    $('nextSchedule').textContent = saved.enabled ? nextLabel(saved.times) : 'Programação pausada. Nenhum novo aviso será iniciado.';
  }
  function clearToken() { $('deviceToken').value = ''; $('pairingResult').hidden = true; }
  async function deviceStatus() {
    if (statusPending) return;
    statusPending = true;
    try {
      const { data, error } = await client.from('medtech_device_links').select('user_id,last_seen_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      $('disconnectDevice').hidden = !data;
      if (!data) $('deviceStatus').textContent = 'Nenhum aparelho vinculado.';
      else if (!data.last_seen_at) $('deviceStatus').textContent = 'Chave criada. Aguardando a primeira conexão do ESP32.';
      else {
        const age = Date.now() - new Date(data.last_seen_at).getTime();
        const date = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(data.last_seen_at));
        $('deviceStatus').textContent = `${age >= 0 && age < 90000 ? 'ESP32 conectado recentemente.' : 'Sem comunicação recente.'} Última consulta: ${date}.`;
      }
    } catch {
      $('deviceStatus').textContent = 'Não foi possível consultar a conexão do aparelho.';
    } finally { statusPending = false; }
  }
  $('addTime').onclick = () => addTime('', true);
  addTime();
  $('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' }).format(new Date());
  try {
    user = await MedTechAuth.verifiedUser();
    if (!user) { location.replace('cadastrar.html'); return; }
    client = MedTechAuth.getClient();
  } catch { location.replace('cadastrar.html'); return; }
  document.documentElement.classList.remove('auth-pending');
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { clearToken(); clearInterval(refreshTimer); location.replace('cadastrar.html'); }
  });
  $('signOut').onclick = async event => {
    event.preventDefault();
    try {
      const { error } = await client.auth.signOut(); if (error) throw error;
      clearToken(); location.replace('cadastrar.html');
    } catch { message('Não foi possível sair. Confira sua conexão e tente novamente.', true); }
  };
  $('scheduleForm').onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const name = $('medicineName').value.trim();
    let times;
    try {
      if (!name || name.length > 80) throw new Error('Informe o nome do remédio, com até 80 caracteres.');
      times = normalizeTimes([...$('timeFields').querySelectorAll('input')].map(input => input.value));
    } catch (error) { message(error.message, true); return; }
    saving = true; $('scheduleFields').disabled = true; $('saveSchedule').textContent = 'Salvando…';
    try {
      const { data, error } = await client.from('medtech_schedule').upsert({
        user_id: user.id, medicine_name: name, times, enabled: $('scheduleEnabled').checked
      }, { onConflict: 'user_id' }).select('medicine_name,times,enabled,updated_at').single();
      if (error) throw error;
      saved = data; renderSaved();
      message('Programação salva na sua conta. O ESP32 conectado receberá a atualização na próxima consulta, em cerca de 30 segundos.');
    } catch (error) { message(readableError(error), true); }
    finally { saving = false; $('scheduleFields').disabled = false; $('saveSchedule').textContent = 'Salvar programação'; updateTimeButtons(); }
  };
  $('pairDevice').onclick = async () => {
    if (pairing) return;
    if (!$('pairingResult').hidden && !window.confirm('Gerar outra chave? A chave exibida agora deixará de funcionar.')) return;
    pairing = true; $('pairDevice').disabled = true; clearToken();
    try {
      const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
      const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const { error } = await client.rpc('medtech_pair_device', { p_token: token });
      if (error) throw error;
      $('deviceToken').value = token; $('pairingResult').hidden = false;
      message('Chave criada. Copie para o código do seu ESP32. A chave anterior foi invalidada.');
      await deviceStatus();
    } catch (error) { message(readableError(error), true); }
    finally { pairing = false; $('pairDevice').disabled = false; }
  };
  $('copyToken').onclick = async () => {
    try { await navigator.clipboard.writeText($('deviceToken').value); message('Chave copiada.'); }
    catch { $('deviceToken').focus(); $('deviceToken').select(); message('Selecione a chave e copie com Ctrl+C.'); }
  };
  $('disconnectDevice').onclick = async () => {
    if (pairing || !window.confirm('Desconectar o ESP32 desta conta?')) return;
    pairing = true; $('disconnectDevice').disabled = true; $('pairDevice').disabled = true;
    try {
      const { error } = await client.rpc('medtech_unpair_device'); if (error) throw error;
      clearToken(); message('Aparelho desconectado. A programação permanece salva.'); await deviceStatus();
    } catch (error) { message(readableError(error), true); }
    finally { pairing = false; $('disconnectDevice').disabled = false; $('pairDevice').disabled = false; }
  };
  try {
    const { data, error } = await client.from('medtech_schedule').select('medicine_name,times,enabled,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    saved = data;
    if (data) {
      $('medicineName').value = data.medicine_name; $('scheduleEnabled').checked = data.enabled;
      $('timeFields').replaceChildren(); data.times.forEach(time => addTime(time));
    }
    renderSaved(); $('scheduleFields').disabled = false; $('pairDevice').disabled = false;
    message(data ? 'Sua programação está carregada. Você pode alterar e salvar quando quiser.' : 'Comece preenchendo o nome do remédio e pelo menos um horário.');
    await deviceStatus();
    refreshTimer = setInterval(() => { if (!document.hidden) { deviceStatus(); renderSaved(); } }, 30000);
  } catch (error) { message(readableError(error), true); $('deviceStatus').textContent = 'Conexão disponível após ativar o cadastro.'; }
  window.addEventListener('pagehide', () => { clearToken(); clearInterval(refreshTimer); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
});
