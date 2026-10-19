document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { TIME_ZONE, WEEKDAYS, ALL_DAYS, normalizeDays, normalizeTimes, nextLabel } = MedTechSchedule;
  const status = $('pageStatus');
  let user, client, saved = null, saving = false, pairing = false, statusPending = false;
  let refreshTimer;
  let supportsWeekdays = true, supportsActuation = false;
  const actionColumns = 'actuation_kind,servo_channel,volume_ml';
  function actionFields() {
    $('servoChoice').hidden = $('actuationKind').value !== 'tablet';
    $('volumeChoice').hidden = $('actuationKind').value !== 'liquid';
    $('servoChannel').disabled = $('servoChoice').hidden;
    $('servoChannel').required = !$('servoChoice').hidden;
    $('volumeMl').disabled = $('volumeChoice').hidden;
    $('volumeMl').required = !$('volumeChoice').hidden;
  }
  $('actuationKind').onchange = actionFields;
  actionFields();
  const dailyColumns = "medicine_name,times,enabled,updated_at";
  const weeklyColumns = "medicine_name,times,weekdays,enabled,updated_at";
  function missingWeekdays(error) {
    return ["42703", "PGRST204"].includes(error?.code) && /weekdays/i.test((error.message || "") + (error.details || ""));
  }
  let linked = false, historyPending = false, historyOffset = 0;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function readableError(error) {
    if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error?.code)) {
      return 'O cadastro precisa ser ativado no Supabase. Confira CONFIGURAR-MEDICAMENTOS.md e aplique a migração adequada e recarregue a página.';
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
    $('savedDays').textContent = saved ? (saved.weekdays || ALL_DAYS).map(day => WEEKDAYS[day]).join(' · ') : '';
    if (!saved) {
      $('savedTitle').textContent = 'Nenhum remédio cadastrado';
      $('nextSchedule').textContent = 'Salve sua primeira programação para começar.';
      return;
    }
    $('savedTitle').textContent = saved.medicine_name;
    $('savedActuation').textContent = saved.actuation_kind === 'tablet' ? 'Objeto de teste · canal ' + saved.servo_channel : saved.actuation_kind === 'liquid' ? 'Água · volume solicitado ' + saved.volume_ml + ' mL (vazão provisória)' : 'Sem acionamento configurado.';
    saved.times.forEach(time => {
      const chip = document.createElement('span'); chip.textContent = time; $('savedTimes').append(chip);
    });
    $('nextSchedule').textContent = saved.enabled ? nextLabel(saved.times, new Date(), saved.weekdays || ALL_DAYS) : 'Programação pausada. Nenhum novo aviso será iniciado.';
  }
  function clearToken() { $('deviceToken').value = ''; $('pairingResult').hidden = true; }
  async function deviceStatus() {
    if (statusPending) return;
    statusPending = true;
    try {
      const { data, error } = await client.from('medtech_device_links').select('user_id,last_seen_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      linked = Boolean(data);
      $('pairDevice').textContent = linked ? 'Gerar nova chave do ESP32' : 'Gerar chave do ESP32';
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
  WEEKDAYS.forEach((day, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = index; input.checked = true;
    label.append(input, document.createTextNode(day)); $('weekdayFields').append(label);
  });
  async function loadHistory(reset = false) {
    if (historyPending) return;
    historyPending = true;
    $('refreshHistory').disabled = true; $('moreHistory').disabled = true;
    if (reset) { historyOffset = 0; $('historyRows').replaceChildren(); $('historyTable').hidden = true; $('moreHistory').hidden = true; }
    $('historyStatus').textContent = 'Carregando registros…';
    try {
      const { data, error } = await client.from(supportsActuation ? 'medtech_actuation_events' : 'medtech_dose_history')
        .select('id,occurred_at,medicine_name,status').eq('user_id', user.id)
        .order('occurred_at', { ascending: false }).order('id', { ascending: false }).range(historyOffset, historyOffset + 49);
      if (error) throw error;
      const labels = { reserved: 'Reservado; execução não confirmada', cycle_executed_unconfirmed: 'Ciclo executado; sem confirmação física', interrupted_unknown: 'Interrompido; resultado físico desconhecido', skipped: 'Acionamento não iniciado', taken: 'Tomada confirmada', missed: 'Não tomada', dispensed: 'Dispensada', alerted: 'Aviso emitido' };
      data.forEach(record => {
        const row = document.createElement('tr');
        const date = new Date(record.occurred_at);
        const valid = Number.isFinite(date.getTime());
        [valid ? date.toLocaleDateString('pt-BR', { timeZone: TIME_ZONE }) : 'Data indisponível',
          valid ? date.toLocaleTimeString('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : '—',
          record.medicine_name, labels[record.status] || record.status || 'Não informado'].forEach(value => {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        });
        $('historyRows').append(row);
      });
      historyOffset += data.length;
      $('historyTable').hidden = historyOffset === 0;
      $('historyStatus').textContent = historyOffset ? historyOffset + ' registro(s) exibido(s). Aviso ou dispensação não comprovam ingestão.' : (supportsActuation ? 'Nenhum acionamento registrado. Sem confirmação física ou de ingestão.' : 'Nenhuma dose registrada. Os registros aparecerão quando forem enviados pela integração do MedTech.');
      $('moreHistory').hidden = data.length < 50;
    } catch (error) {
      $('historyStatus').textContent = ['42P01', 'PGRST205'].includes(error?.code)
        ? (supportsActuation ? 'O histórico de acionamentos ainda não está disponível. Confira a migração demo-v1.' : 'O histórico de doses ainda não está disponível. Os registros serão exibidos quando essa função estiver habilitada.')
        : 'Não foi possível carregar o histórico. Tente atualizar novamente.';
    } finally { historyPending = false; $('refreshHistory').disabled = false; $('moreHistory').disabled = false; }
  }
  $('refreshHistory').onclick = () => loadHistory(true);
  $('moreHistory').onclick = () => loadHistory();
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
    let times, weekdays, action = {};
    try {
      if (!name || name.length > 80) throw new Error('Informe o nome do remédio, com até 80 caracteres.');
      if (supportsActuation) action = MedTechActuation.normalize($('actuationKind').value, $('servoChannel').value, $('volumeMl').value);
      weekdays = supportsWeekdays ? normalizeDays([...$('weekdayFields').querySelectorAll('input:checked')].map(input => Number(input.value))) : ALL_DAYS;
      times = normalizeTimes([...$('timeFields').querySelectorAll('input')].map(input => input.value));
    } catch (error) { message(error.message, true); return; }
    saving = true; $('scheduleFields').disabled = true; $('saveSchedule').textContent = 'Salvando…';
    try {
      const payload = { user_id: user.id, medicine_name: name, times, enabled: $('scheduleEnabled').checked };
      Object.assign(payload, action);
      if (supportsWeekdays) payload.weekdays = weekdays;
      const { data, error } = await client.from('medtech_schedule').upsert(payload, { onConflict: 'user_id' })
        .select((supportsWeekdays ? weeklyColumns : dailyColumns) + (supportsActuation ? ',' + actionColumns : '')).single();
      if (error) throw error;
      saved = data; renderSaved();
      message('Programação salva na sua conta. A sincronização depende da comunicação e do suporte semanal do ESP32.');
    } catch (error) { message(readableError(error), true); }
    finally { saving = false; $('scheduleFields').disabled = false; $('saveSchedule').textContent = 'Salvar programação'; updateTimeButtons(); }
  };
  $('pairDevice').onclick = async () => {
    if (pairing) return;
    if ((linked || !$('disconnectDevice').hidden || !$('pairingResult').hidden) && !window.confirm('Gerar outra chave? A chave anterior deixará de funcionar.')) return;
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
    let result = await client.from('medtech_schedule').select(weeklyColumns).eq('user_id', user.id).maybeSingle();
    if (missingWeekdays(result.error)) {
      supportsWeekdays = false;
      result = await client.from('medtech_schedule').select(dailyColumns).eq('user_id', user.id).maybeSingle();
    }
    const { data, error } = result;
    if (error) throw error;
    saved = data;
    const actionResult = await client.from('medtech_schedule').select(actionColumns).eq('user_id', user.id).maybeSingle();
    if (actionResult.error && !(['42703','PGRST204'].includes(actionResult.error.code) && /actuation_kind|servo_channel|volume_ml/i.test((actionResult.error.message || '') + (actionResult.error.details || '')))) throw actionResult.error;
    supportsActuation = !actionResult.error && (!actionResult.data || Object.hasOwn(actionResult.data, 'actuation_kind'));
    $('actuationFields').disabled = !supportsActuation;
    $('actuationHint').textContent = supportsActuation ? 'Somente água e objetos de teste. Valores provisórios; sem confirmação física. Um tipo de saída por programação.' : 'Acionamento indisponível: a migração demo-v1 ainda não foi instalada. A programação existente continua disponível.';
    if (supportsActuation) {
      if (saved) Object.assign(saved, actionResult.data);
      $('actuationKind').value = actionResult.data?.actuation_kind || '';
      $('servoChannel').value = actionResult.data?.servo_channel == null ? '' : String(actionResult.data.servo_channel);
      $('volumeMl').value = actionResult.data?.volume_ml == null ? '' : String(actionResult.data.volume_ml);
      actionFields();
      $('historyTitle').textContent = 'Histórico de acionamentos de teste';
      $('historyTable').querySelector('caption').textContent = 'Ciclos de teste · horário de Brasília · sem confirmação física';
    }
    $('weekdaysHint').textContent = supportsWeekdays
      ? 'Escolha os dias da semana e os horários, no horário de Brasília. A execução depende do suporte do aparelho.'
      : 'Sua programação atual se repete todos os dias, no horário de Brasília. A seleção semanal ainda não está disponível.';
    $('weekdayFields').querySelectorAll('input').forEach(input => { input.disabled = !supportsWeekdays; });
    if (data) {
      $('weekdayFields').querySelectorAll('input').forEach(input => { input.checked = (data.weekdays || ALL_DAYS).includes(Number(input.value)); });
      $('medicineName').value = data.medicine_name; $('scheduleEnabled').checked = data.enabled;
      $('timeFields').replaceChildren(); data.times.forEach(time => addTime(time));
    }
    renderSaved(); $('scheduleFields').disabled = false;
    message(data ? 'Sua programação está carregada. Você pode alterar e salvar quando quiser.' : 'Comece preenchendo o nome do remédio e pelo menos um horário.');

  } catch (error) { message(readableError(error), true); $('deviceStatus').textContent = 'Conexão disponível após ativar o cadastro.'; }
  $('pairDevice').disabled = false;
  await Promise.allSettled([deviceStatus(), loadHistory(true)]);
  refreshTimer = setInterval(() => { if (!document.hidden) { deviceStatus(); renderSaved(); } }, 30000);
  window.addEventListener('pagehide', () => { clearToken(); clearInterval(refreshTimer); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
});
