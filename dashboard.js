document.addEventListener('DOMContentLoaded',async()=>{
try {
  if (!await MedTechAuth.verifiedUser()) { location.replace('cadastrar.html'); return; }
} catch { location.replace('cadastrar.html'); return; }
document.documentElement.classList.remove('auth-pending');
MedTechAuth.getClient().auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') location.replace('cadastrar.html');
});
const out=document.getElementById('signOut');
out.addEventListener('click',async(event)=>{
  event.preventDefault();
  try {
    const {error}=await MedTechAuth.getClient().auth.signOut();
    if(error) throw error;
    location.replace('cadastrar.html');
  } catch { alert('Não foi possível sair. Confira sua conexão e tente novamente.'); }
});
const today=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long'}).format(new Date());document.getElementById('todayLabel').textContent=today;let confirmed=false,postponed=false;const activity=document.getElementById('activityList');function log(message){const li=document.createElement('li');li.innerHTML='<span class="activity-dot"></span><div><strong></strong><small>Agora · Demonstração</small></div>';li.querySelector('strong').textContent=message;activity.prepend(li)}document.getElementById('confirmDose').onclick=()=>{if(confirmed)return;confirmed=true;document.getElementById('doseState').textContent='Confirmada nesta simulação';document.getElementById('doseMessage').textContent='Registro de demonstração confirmado. Não houve acionamento de dispositivo.';document.getElementById('progressValue').textContent='3/3';document.getElementById('progressTitle').textContent='3 de 3 registros na simulação';document.getElementById('progressRing').style.setProperty('--angle','360deg');document.getElementById('confirmDose').disabled=true;document.getElementById('snoozeDose').disabled=true;log('Dose de exemplo marcada como confirmada')};document.getElementById('snoozeDose').onclick=()=>{if(postponed||confirmed)return;postponed=true;document.querySelector('.dose-time').firstChild.textContent='10:45 ';document.getElementById('doseState').textContent='Adiada na simulação';document.getElementById('snoozeDose').disabled=true;log('Horário ilustrativo adiado em 15 minutos')}});
