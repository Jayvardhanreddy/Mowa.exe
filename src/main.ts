import Phaser from 'phaser';
import './style.css';

type Fighter = {
  x:number; y:number; vx:number; vy:number; hp:number; energy:number;
  facing:number; grounded:boolean; blocking:boolean; attack:number; attackKind:string;
  attackClock:number; cooldown:number; hitDone:boolean; dash:number; stun:number;
};

const W=1100, H=620, FLOOR=510;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

class RiftScene extends Phaser.Scene {
  mode:'menu'|'fight'|'result'='menu';
  g!:Phaser.GameObjects.Graphics;
  ui!:Phaser.GameObjects.Container;
  keys!:Record<string,Phaser.Input.Keyboard.Key>;
  player!:Fighter; cpu!:Fighter;
  timeLeft=90; last=0; aiThink=0; shake=0; flash=0; winner='';
  soundOn=true; audio?:AudioContext;\n  textCache=new Map<string,Phaser.GameObjects.Text>();
  constructor(){super('rift');}
  create(){
    this.g=this.add.graphics();
    this.ui=this.add.container(0,0);
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,J,K,L,U,SHIFT,ENTER,SPACE,ESC') as Record<string,Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>this.pointer(p.x,p.y));
    this.scale.on('resize',()=>this.draw());
    this.showMenu();
  }
  showMenu(){this.mode='menu';this.draw();}
  startFight(){
    this.mode='fight'; this.timeLeft=90; this.winner=''; this.shake=0; this.flash=0;
    this.player=this.makeFighter(330,1); this.cpu=this.makeFighter(770,-1);
    this.aiThink=0; this.last=this.time.now; this.draw();
  }
  makeFighter(x:number,facing:number):Fighter{return {x,y:FLOOR,vx:0,vy:0,hp:100,energy:0,facing,grounded:true,blocking:false,attack:0,attackKind:'',attackClock:0,cooldown:0,hitDone:false,dash:0,stun:0};}
  pointer(x:number,y:number){
    const sx=this.scale.width/W, sy=this.scale.height/H; x/=sx; y/=sy;
    if(this.mode==='menu' && x>390&&x<710&&y>380&&y<455) this.startFight();
    else if(this.mode==='result' && x>365&&x<735&&y>390&&y<470) this.startFight();
    else if(this.mode==='fight'){
      if(y>H-115){
        if(x< W*.25) this.playerAction('left');
        else if(x<W*.42) this.playerAction('right');
        else if(x<W*.57) this.playerAction('jump');
        else if(x<W*.70) this.playerAction('block');
        else if(x<W*.80) this.playerAction('light');
        else if(x<W*.90) this.playerAction('heavy');
        else this.playerAction('special');
      }
    }
  }
  playerAction(action:string){
    const p=this.player;
    if(action==='left')p.vx=-340;
    if(action==='right')p.vx=340;
    if(action==='jump'&&p.grounded){p.vy=-650;p.grounded=false;this.sfx(260);}
    if(action==='block')p.blocking=true;
    if(action==='light')this.attack(p,'light');
    if(action==='heavy')this.attack(p,'heavy');
    if(action==='special')this.attack(p,p.energy>=100?'ultimate':'special');
  }
  attack(f:Fighter,kind:string){
    if(f.cooldown>0||f.stun>0||f.attack>0)return;
    if(kind==='ultimate'&&f.energy<100)return;
    f.attack=kind==='light'?.22:kind==='heavy'?.42:kind==='special'?.58:1.05;
    f.attackClock=f.attack;f.attackKind=kind;f.cooldown=kind==='light'?.28:kind==='heavy'?.58:kind==='special'?1.1:2.2;f.hitDone=false;
    if(kind==='ultimate')f.energy=0;
    this.sfx(kind==='light'?440:kind==='heavy'?180:kind==='special'?320:90);
  }
  update(_t:number,dtMs:number){
    if(this.mode!=='fight')return;
    const dt=Math.min(dtMs/1000,.033); const p=this.player,c=this.cpu;
    this.timeLeft=Math.max(0,this.timeLeft-dt);
    this.readInput();
    this.ai(dt);
    this.stepFighter(p,dt);this.stepFighter(c,dt);
    this.resolveHit(p,c);this.resolveHit(c,p);
    if(p.hp<=0||c.hp<=0||this.timeLeft<=0){this.mode='result';this.winner=p.hp===c.hp?'DRAW':p.hp>c.hp?'PLAYER 1':'CPU';}
    this.shake=Math.max(0,this.shake-dt*22);this.flash=Math.max(0,this.flash-dt*2.5);
    this.draw();
  }
  readInput(){
    const p=this.player,k=this.keys;
    if(Phaser.Input.Keyboard.JustDown(k.W)&&p.grounded){p.vy=-650;p.grounded=false;this.sfx(260);}
    p.blocking=k.S.isDown;
    if(k.A.isDown)p.vx=-340;else if(k.D.isDown)p.vx=340;
    if(Phaser.Input.Keyboard.JustDown(k.SHIFT)&&p.cooldown<=0){p.dash=.16;p.vx=p.facing*-850;this.sfx(120);}
    if(Phaser.Input.Keyboard.JustDown(k.J))this.attack(p,'light');
    if(Phaser.Input.Keyboard.JustDown(k.K))this.attack(p,'heavy');
    if(Phaser.Input.Keyboard.JustDown(k.L))this.attack(p,'special');
    if(Phaser.Input.Keyboard.JustDown(k.U))this.attack(p,'ultimate');
  }
  ai(dt:number){
    const c=this.cpu,p=this.player;const dist=Math.abs(p.x-c.x);this.aiThink-=dt;
    c.facing=p.x>c.x?1:-1;
    if(c.stun>0||c.attack>0){c.vx*=.8;return;}
    if(this.aiThink<=0){
      this.aiThink=.24+Math.random()*.25;
      if(dist>145){c.vx=c.facing*230;c.blocking=false;}
      else if(Math.random()<.24){c.blocking=true;c.vx=0;}
      else {c.blocking=false;c.vx=0;this.attack(c,dist<95&&Math.random()<.65?'light':c.energy>=100?'ultimate':Math.random()<.4?'special':'heavy');}
      if(p.attack>0&&dist<155&&Math.random()<.55)c.blocking=true;
    }
  }
  stepFighter(f:Fighter,dt:number){
    f.cooldown=Math.max(0,f.cooldown-dt);f.attack=Math.max(0,f.attack-dt);f.stun=Math.max(0,f.stun-dt);f.dash=Math.max(0,f.dash-dt);
    if(f.attack===0&&f.stun===0&&!f.blocking&&f.dash===0)f.x+=f.vx*dt;
    f.vy+=1500*dt;f.y+=f.vy*dt;
    if(f.y>=FLOOR){f.y=FLOOR;f.vy=0;f.grounded=true;}
    f.x=clamp(f.x,95,W-95);
    if(f.attack===0&&f.dash===0)f.vx*=Math.pow(.001,dt);
  }
  resolveHit(a:Fighter,b:Fighter){
    if(a.attack<=0||a.hitDone)return;
    const elapsed=a.attackClock-a.attack;
    const active=a.attackKind==='light'?.10:a.attackKind==='heavy'?.18:a.attackKind==='special'?.28:.48;
    if(elapsed<active||elapsed>active+.13)return;
    const range=a.attackKind==='special'?260:a.attackKind==='ultimate'?340:a.attackKind==='heavy'?155:125;
    if(Math.abs(a.x-b.x)<range&&Math.abs(a.y-b.y)<115&&a.facing===(b.x>a.x?1:-1)){
      a.hitDone=true;
      const damage=a.attackKind==='light'?7:a.attackKind==='heavy'?13:a.attackKind==='special'?18:34;
      const blocked=b.blocking&&b.facing===(a.x>b.x?1:-1);
      b.hp=clamp(b.hp-(blocked?damage*.18:damage),0,100);
      if(!blocked){b.stun=a.attackKind==='ultimate'?.52:.18;b.vx=a.facing*(a.attackKind==='ultimate'?570:250);this.shake=a.attackKind==='ultimate'?12:5;this.flash=.6;}
      a.energy=clamp(a.energy+(blocked?7:damage*.8),0,100);
      this.sfx(blocked?130:a.attackKind==='ultimate'?65:220);
    }
  }
  sfx(freq:number){if(!this.soundOn)return;try{this.audio??=new AudioContext();const o=this.audio.createOscillator(),g=this.audio.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.setValueAtTime(.045,this.audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.audio.currentTime+.11);o.connect(g);g.connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+.12);}catch{}}
  text(x:number,y:number,value:string,size:number,color='#fff',font='Rajdhani',align:'left'|'center'|'right'='left'){
    const t=this.add.text(x,y,value,{fontFamily:font,fontSize:size,color,align,fontStyle:'bold',letterSpacing:1});
    t.setOrigin(align==='center'?.5:align==='right'?1:0,.5);this.ui.add(t);return t;
  }
  bar(x:number,y:number,w:number,h:number,value:number,color:number,reverse=false){
    this.g.fillStyle(0x111421,.95);this.g.fillRoundedRect(x,y,w,h,5);
    this.g.fillStyle(color,1);this.g.fillRoundedRect(reverse?x+w-w*value/100:x,y,w*value/100,h,5);
    this.g.lineStyle(1,0xffffff,.18);this.g.strokeRoundedRect(x,y,w,h,5);
  }
  draw(){
    if(!this.g)return;this.g.clear();this.textCache.forEach(t=>t.setVisible(false));
    const sx=this.scale.width/W,sy=this.scale.height/H;
    this.g.fillGradientStyle(0x090b1b,0x090b1b,0x17102b,0x17102b,1);this.g.fillRect(0,0,W,H);
    // Rift sky and distant structures
    for(let i=0;i<14;i++){const x=i*88-20;this.g.fillStyle(i%2?0x22204a:0x182b49,.34);this.g.fillTriangle(x,420,x+35,210+(i%3)*35,x+80,420);}
    this.g.lineStyle(3,0x6d42ff,.45);this.g.beginPath();this.g.moveTo(550,45);this.g.lineTo(520,170);this.g.lineTo(585,255);this.g.lineTo(535,360);this.g.strokePath();
    this.g.lineStyle(1,0x36d9ff,.35);for(let i=0;i<7;i++){this.g.beginPath();this.g.moveTo(550+i*7-20,85);this.g.lineTo(520+i*11-40,300);this.g.strokePath();}
    this.g.fillGradientStyle(0x1b1d37,0x101426,0x090b17,0x090b17,1);this.g.fillRect(0,420,W,200);
    this.g.lineStyle(2,0x6d42ff,.6);this.g.lineBetween(0,420,W,420);
    for(let i=0;i<16;i++){this.g.lineStyle(1,0x2a3150,.5);this.g.lineBetween(i*80,420,550+(i-7)*125,620);}
    if(this.mode==='menu'){this.drawMenu();return;}
    this.drawFighter(this.player,true);this.drawFighter(this.cpu,false);
    this.drawHud();
    if(this.mode==='result')this.drawResult();
    if(this.flash>0){this.g.fillStyle(0x9eecff,this.flash*.12);this.g.fillRect(0,0,W,H);}
    // mobile action strip
    this.g.fillStyle(0x070a17,.78);this.g.fillRoundedRect(16,535,W-32,70,12);
    const labels=['◀','▶','JUMP','GUARD','LIGHT','HEAVY','SKILL'];
    labels.forEach((s,i)=>{const x=54+i*164;this.g.lineStyle(1,0x5b5d91,.55);this.g.strokeRoundedRect(x-35,548,70,42,8);this.text(x,569,s,14,i>3?'#70e8ff':'#d4d7f4','Orbitron','center');});
    this.text(550,518,'A / D MOVE     W JUMP     S BLOCK     SHIFT DASH     J K L U ATTACK',12,'#7f86a8','Orbitron','center');
    this.ui.setScale(sx,sy);
  }
  drawFighter(f:Fighter,isPlayer:boolean){
    const col=isPlayer?0x33d9ff:0xff477d, glow=isPlayer?0x167bba:0x9b2456;
    this.g.fillStyle(0x000000,.4);this.g.fillEllipse(f.x,FLOOR+3,105,18);
    this.g.fillStyle(glow,.2);this.g.fillCircle(f.x,f.y-105,70);
    // legs / torso / head silhouette
    this.g.fillStyle(col,1);this.g.fillRoundedRect(f.x-24,f.y-88,48,58,12);
    this.g.fillStyle(isPlayer?0xc6f7ff:0xffc4d5,1);this.g.fillCircle(f.x,f.y-111,21);
    this.g.fillStyle(isPlayer?0x0b2740:0x47152d,1);this.g.fillTriangle(f.x-22,f.y-123,f.x+20,f.y-125,f.x+f.facing*32,f.y-150);
    this.g.fillStyle(col,1);this.g.fillRoundedRect(f.x-22,f.y-35,17,35,6);this.g.fillRoundedRect(f.x+5,f.y-35,17,35,6);
    this.g.fillStyle(isPlayer?0xb7f7ff:0xffd3e0,1);this.g.fillRoundedRect(f.x+(f.facing>0?14:-40),f.y-82,28,13,6);
    if(f.blocking){this.g.lineStyle(4,col,.9);this.g.strokeCircle(f.x,f.y-76,57);}
    if(f.attack>0){
      const color=f.attackKind==='ultimate'?0xffffff:col;this.g.fillStyle(color,f.attackKind==='ultimate'?.55:.3);
      const radius=f.attackKind==='ultimate'?150:f.attackKind==='special'?100:65;
      this.g.fillCircle(f.x+f.facing*radius*.55,f.y-75,radius*.45);
      this.g.lineStyle(f.attackKind==='ultimate'?12:5,color,.9);this.g.beginPath();this.g.arc(f.x,f.y-75, radius, f.facing===1?-.9:2.1, f.facing===1?.9:4.1);this.g.strokePath();
    }
  }
  drawHud(){
    this.text(42,32,'RIFT RUNNER',17,'#8cefff','Orbitron');this.text(1058,32,'SHINOBI ECHO',17,'#ff8cac','Orbitron','right');
    this.bar(42,52,420,18,this.player.hp,0x35dfff);this.bar(638,52,420,18,this.cpu.hp,0xff477d,true);
    this.bar(42,78,260,8,this.player.energy,0x8e61ff);this.bar(798,78,260,8,this.cpu.energy,0xffa0c0,true);
    this.text(42,98,'RIFT ENERGY',10,'#9c9dbd','Orbitron');this.text(1058,98,'RIFT ENERGY',10,'#9c9dbd','Orbitron','right');
    this.text(550,45,String(Math.ceil(this.timeLeft)).padStart(2,'0'),28,'#fff','Orbitron','center');
    this.text(550,78,'ROUND 01',11,'#a8a5c9','Orbitron','center');
  }
  drawMenu(){
    this.g.fillStyle(0x050713,.6);this.g.fillRect(0,0,W,H);
    this.text(550,115,'MOWA.exe PRESENTS',14,'#7e82b4','Orbitron','center');
    this.text(550,205,'ANIME RIFT',62,'#f4f5ff','Orbitron','center');
    this.text(550,258,'.exe',27,'#6deaff','Orbitron','center');
    this.text(550,315,'TWO WORLDS. ONE BATTLEFIELD. NO RULES.',16,'#aeb4d5','Rajdhani','center');
    this.g.lineStyle(1,0x6f54ff,.65);this.g.strokeRoundedRect(390,378,320,78,10);
    this.g.fillStyle(0x3a2c86,.6);this.g.fillRoundedRect(394,382,312,70,8);
    this.text(550,416,'ENTER THE RIFT  →',20,'#fff','Orbitron','center');
    this.text(550,492,'PLAYER 1  //  RIFT RUNNER',12,'#6deaff','Orbitron','center');
    this.text(550,516,'VS',12,'#777da4','Orbitron','center');
    this.text(550,540,'CPU  //  SHINOBI ECHO',12,'#ff7da4','Orbitron','center');
    this.text(550,585,'A / D MOVE   •   W JUMP   •   J LIGHT   •   K HEAVY   •   L SPECIAL   •   U ULTIMATE',11,'#737b9f','Orbitron','center');
    this.ui.setScale(this.scale.width/W,this.scale.height/H);
  }
  drawResult(){
    this.g.fillStyle(0x050713,.82);this.g.fillRoundedRect(300,175,500,300,18);
    this.g.lineStyle(2,0x7d61ff,.8);this.g.strokeRoundedRect(300,175,500,300,18);
    this.text(550,230,'RIFT COLLISION COMPLETE',13,'#9d9acb','Orbitron','center');
    this.text(550,300,this.winner==='DRAW'?'DRAW':this.winner+' WINS',38,'#fff','Orbitron','center');
    this.text(550,350,'THE RIFT IS STILL OPEN.',14,'#8cefff','Rajdhani','center');
    this.g.fillStyle(0x4433a0,.8);this.g.fillRoundedRect(365,390,370,65,9);
    this.text(550,422,'FIGHT AGAIN  ↻',18,'#fff','Orbitron','center');
    this.ui.setScale(this.scale.width/W,this.scale.height/H);
  }
}

const game=new Phaser.Game({
  type:Phaser.AUTO,parent:'game',backgroundColor:'#090b17',
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:W,height:H},
  render:{antialias:true,pixelArt:false},scene:[RiftScene]
});
const soundButton=document.querySelector<HTMLButtonElement>('#sound-toggle');
soundButton?.addEventListener('click',()=>{const scene=game.scene.getScene('rift') as RiftScene;scene.soundOn=!scene.soundOn;soundButton.textContent=scene.soundOn?'SOUND: ON':'SOUND: OFF';});
window.addEventListener('keydown',(e)=>{if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();});
