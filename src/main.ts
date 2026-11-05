import Phaser from 'phaser';
import './style.css';
import { CHARACTERS, getCharacter } from './characters';

type Fighter = {
  characterId:string; x:number; y:number; vx:number; vy:number; hp:number; energy:number;
  facing:number; grounded:boolean; blocking:boolean; attack:number; attackKind:string;
  attackClock:number; cooldown:number; hitDone:boolean; dash:number; stun:number;
};

const W=1100, H=620, FLOOR=510;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

class RiftScene extends Phaser.Scene {
  mode:'menu'|'select'|'fight'|'result'='menu';
  selectedPlayerId='luffy'; selectedCpuId='naruto'; selectionStep:0|1|2=0;
  g!:Phaser.GameObjects.Graphics;
  ui!:Phaser.GameObjects.Container;
  keys!:Record<string,Phaser.Input.Keyboard.Key>;
  player!:Fighter; cpu!:Fighter;
  timeLeft=90; last=0; aiThink=0; shake=0; flash=0; winner='';
  soundOn=true; audio?:AudioContext;
  textCache=new Map<string,Phaser.GameObjects.Text>();
  constructor(){super('rift');}
  create(){
    this.g=this.add.graphics();
    this.ui=this.add.container(0,0);
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,J,K,L,U,SHIFT,ENTER,SPACE,ESC') as Record<string,Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>this.pointer(p.x,p.y));
    this.input.on('pointerup',()=>{if(this.mode==='fight')this.player.blocking=false;});
    this.input.keyboard!.on('keydown-ENTER',()=>{if(this.mode==='menu')this.openSelect();else if(this.mode==='select'){if(this.selectionStep===2)this.startFight();else this.autoSelectNext();}else if(this.mode==='result')this.openSelect();});
    this.input.keyboard!.on('keydown-SPACE',()=>{if(this.mode==='result')this.startFight();});
    this.scale.on('resize',()=>this.draw());
    this.showMenu();
  }
  showMenu(){this.mode='menu';this.draw();}
  openSelect(){this.mode='select';this.selectionStep=0;this.draw();}
  autoSelectNext(){if(this.selectionStep===0){this.selectedPlayerId='luffy';this.selectionStep=1;}else if(this.selectionStep===1){this.selectedCpuId=this.selectedCpuId===this.selectedPlayerId?'gojo':'naruto';if(this.selectedCpuId===this.selectedPlayerId)this.selectedCpuId='gojo';this.selectionStep=2;}this.draw();}
  selectCharacter(id:string){
    if(this.selectionStep===0){this.selectedPlayerId=id;this.selectionStep=1;}
    else if(this.selectionStep===1){if(id===this.selectedPlayerId)return;this.selectedCpuId=id;this.selectionStep=2;}
    else {this.selectedPlayerId=id;this.selectionStep=1;}
    this.draw();
  }
  startFight(){
    if(this.selectionStep!==2){this.mode='select';this.autoSelectNext();return;}
    this.mode='fight'; this.timeLeft=99; this.winner=''; this.shake=0; this.flash=0;
    this.player=this.makeFighter(330,1,this.selectedPlayerId); this.cpu=this.makeFighter(770,-1,this.selectedCpuId);
    this.aiThink=0; this.last=this.time.now; this.draw();
  }
  makeFighter(x:number,facing:number,characterId:string):Fighter{return {characterId,x,y:FLOOR,vx:0,vy:0,hp:100,energy:0,facing,grounded:true,blocking:false,attack:0,attackKind:'',attackClock:0,cooldown:0,hitDone:false,dash:0,stun:0};}
  pointer(x:number,y:number){
    const sx=this.scale.width/W, sy=this.scale.height/H; x/=sx; y/=sy;
    if(this.mode==='menu' && x>360&&x<740&&y>365&&y<475) this.openSelect();
    else if(this.mode==='select'){
      if(y<72&&x<150){this.showMenu();return;}
      if(y>=164&&y<=466){const col=Math.floor((x-37)/171),row=Math.floor((y-164)/51);const index=row*6+col;if(col>=0&&col<6&&row>=0&&row<6&&index<CHARACTERS.length)this.selectCharacter(CHARACTERS[index].id);}
      else if(y>=500&&y<540){if(x<500)this.selectionStep=0;else if(x>600)this.selectionStep=1;this.draw();}
      else if(y>=540&&x>390&&x<710&&this.selectionStep===2)this.startFight();
    }
    else if(this.mode==='result' && x>365&&x<735&&y>390&&y<470) this.openSelect();
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
    if(action==='left'){p.vx=-340;p.facing=-1;}
    if(action==='right'){p.vx=340;p.facing=1;}
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
    if(k.A.isDown){p.vx=-340;p.facing=-1;}else if(k.D.isDown){p.vx=340;p.facing=1;}
    if(Phaser.Input.Keyboard.JustDown(k.SHIFT)&&p.cooldown<=0){p.dash=.16;p.vx=p.facing*850;this.sfx(120);}
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
      const profile=getCharacter(c.characterId);
      if(dist>145*profile.reach){c.vx=c.facing*(185+profile.aggression*75);c.blocking=false;}
      else if(Math.random()<profile.guard*.42){c.blocking=true;c.vx=0;}
      else {c.blocking=false;c.vx=0;this.attack(c,dist<95&&Math.random()<.65?'light':c.energy>=100?'ultimate':Math.random()<profile.aggression*.55?'special':'heavy');}
      if(p.attack>0&&dist<155&&Math.random()<profile.guard*.8)c.blocking=true;
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
      const profile=getCharacter(a.characterId);
      const baseDamage=a.attackKind==='light'?7:a.attackKind==='heavy'?13:a.attackKind==='special'?18:34;
      const damage=baseDamage*profile.power;
      const blocked=b.blocking&&b.facing===(a.x>b.x?1:-1);
      b.hp=clamp(b.hp-(blocked?damage*.18:damage),0,100);
      if(!blocked){b.stun=a.attackKind==='ultimate'?.52:.18;b.vx=a.facing*(a.attackKind==='ultimate'?570:250);this.shake=a.attackKind==='ultimate'?12:5;this.flash=.6;}
      a.energy=clamp(a.energy+(blocked?7:damage*.8),0,100);
      this.sfx(blocked?130:a.attackKind==='ultimate'?65:220);
    }
  }
  sfx(freq:number){if(!this.soundOn)return;try{this.audio??=new AudioContext();const o=this.audio.createOscillator(),g=this.audio.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.setValueAtTime(.045,this.audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.audio.currentTime+.11);o.connect(g);g.connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+.12);}catch{}}
  text(x:number,y:number,value:string,size:number,color='#fff',font='Rajdhani',align:'left'|'center'|'right'='left'){
    const key=[x,y,font,align].join(':');
    let t=this.textCache.get(key);
    if(!t){
      t=this.add.text(x,y,value,{fontFamily:font,fontSize:size,color,align,fontStyle:'bold',letterSpacing:1});
      t.setOrigin(align==='center'?.5:align==='right'?1:0,.5);
      this.ui.add(t);this.textCache.set(key,t);
    }else{
      t.setText(value);t.setStyle({fontFamily:font,fontSize:size,color,align,fontStyle:'bold',letterSpacing:1});
      t.setVisible(true);
    }
    return t;
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
    // Rift sky: layered skyline, shattered moon and drifting debris
    const pulse=.5+.5*Math.sin(this.time.now/650);
    this.g.fillStyle(0xb3a9ff,.07);this.g.fillCircle(550,184,150+pulse*8);
    this.g.fillStyle(0xaaa5ed,.10);this.g.fillCircle(550,184,112);
    this.g.lineStyle(2,0x8d82ff,.42);this.g.strokeCircle(550,184,126+pulse*4);
    for(let i=0;i<46;i++){
      const sx=(i*173+37)%W, sy=35+(i*71)%300;
      this.g.fillStyle(i%3===0?0x7beeff:0xd8d7ff,.28+((i%4)*.12));
      this.g.fillCircle(sx,sy,i%7===0?2:1);
    }
    for(let i=0;i<11;i++){
      const bx=i*112-26, bh=90+(i*47)%155;
      this.g.fillStyle(i%2?0x202544:0x182039,.92);this.g.fillRect(bx,420-bh,74,bh);
      this.g.fillStyle(0x53618e,.35);
      for(let wy=0;wy<5;wy++)for(let wx=0;wx<3;wx++)this.g.fillRect(bx+12+wx*19,420-bh+15+wy*24,5,9);
      this.g.fillStyle(0x6b58d9,.32);this.g.fillTriangle(bx-12,420-bh,bx+36,420-bh-35,bx+86,420-bh);
    }
    for(let i=0;i<8;i++){
      const px=55+i*145, py=155+(i%3)*55+Math.sin(this.time.now/900+i)*7;
      this.g.fillStyle(i%2?0x4b397f:0x263c65,.55);this.g.fillTriangle(px-17,py-9,px+4,py-34,px+19,py+15);
      this.g.lineStyle(1,0x7e6cff,.45);this.g.lineBetween(px-8,py-3,px+7,py+8);
    }
    this.g.lineStyle(5,0x6d42ff,.58);this.g.beginPath();this.g.moveTo(550,36);this.g.lineTo(518,142);this.g.lineTo(582,225);this.g.lineTo(532,331);this.g.strokePath();
    this.g.lineStyle(2,0x36d9ff,.42);for(let i=0;i<9;i++){this.g.beginPath();this.g.moveTo(550+i*6-24,70);this.g.lineTo(520+i*9-35,300);this.g.strokePath();}
    this.g.fillGradientStyle(0x242743,0x171a30,0x080b16,0x080b16,1);this.g.fillRect(0,420,W,200);
    this.g.lineStyle(2,0x8d65ff,.78);this.g.lineBetween(0,420,W,420);
    for(let i=0;i<17;i++){this.g.lineStyle(1,0x394267,.52);this.g.lineBetween(i*70-20,420,550+(i-8)*142,620);}
    for(let i=0;i<7;i++){const yy=445+i*27;this.g.lineStyle(1,0x29334f,.55);this.g.lineBetween(0,yy,W,yy);}
    this.g.lineStyle(2,0x5d47b5,.55);this.g.strokeEllipse(550,467,650,68);
    this.g.lineStyle(1,0x36d9ff,.32);this.g.strokeEllipse(550,468,490,42);
    for(let i=0;i<12;i++){const rx=85+i*78;this.g.lineStyle(1,0x8c68ff,.22);this.g.lineBetween(rx,420,rx+((i%2)?-24:24),620);}
    if(this.mode==='menu'){this.drawMenu();return;}
    if(this.mode==='select'){this.drawCharacterSelect();return;}
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
    const g=this.g, x=f.x, y=f.y, dir=f.facing;
    const character=getCharacter(f.characterId);
    const primary=character.color, shadow=character.dark, cloth=character.dark, trim=character.hair;
    const skin=0xffd9c5;
    const bob=f.grounded?Math.sin(this.time.now/145+(isPlayer?0:1.7))*2.5:0;
    const lean=f.attack>0?dir*(f.attackKind==='ultimate'?17:8):f.blocking?-dir*5:0;
    const cx=x+lean, base=y+bob;
    const poly=(pts:{x:number,y:number}[],color:number,alpha=1)=>{
      g.fillStyle(color,alpha);g.beginPath();g.moveTo(pts[0].x,pts[0].y);
      for(let i=1;i<pts.length;i++)g.lineTo(pts[i].x,pts[i].y);
      g.closePath();g.fillPath();
    };
    g.fillStyle(0x000000,.48);g.fillEllipse(x,base+3,112,19);
    g.fillStyle(primary,.10);g.fillCircle(cx,base-88,68+Math.sin(this.time.now/180)*4);
    g.lineStyle(2,primary,.25);g.strokeCircle(cx,base-88,54+Math.sin(this.time.now/220)*5);
    // Coat tails and layered leg armour
    poly([{x:cx-dir*7,y:base-100},{x:cx-dir*37,y:base-82},{x:cx-dir*56,y:base-25},{x:cx-dir*28,y:base-38},{x:cx-dir*2,y:base-70}],cloth,.98);
    poly([{x:cx-dir*27,y:base-81},{x:cx-dir*50,y:base-42},{x:cx-dir*31,y:base-47}],primary,.8);
    poly([{x:cx-17,y:base-48},{x:cx-3,y:base-48},{x:cx-7,y:base-20},{x:cx-18,y:base-3},{x:cx-33,y:base-3},{x:cx-27,y:base-18}],shadow);
    poly([{x:cx+2,y:base-48},{x:cx+19,y:base-48},{x:cx+28,y:base-18},{x:cx+37,y:base-5},{x:cx+17,y:base-3},{x:cx+7,y:base-20}],cloth);
    g.fillStyle(primary,1);g.fillRoundedRect(cx-31,base-12,24,10,4);g.fillRoundedRect(cx+14,base-12,26,10,4);
    g.fillStyle(trim,.9);g.fillCircle(cx-17,base-34,5);g.fillCircle(cx+18,base-34,5);
    // Layered jacket, shoulder panels and glowing seams
    poly([{x:cx-22,y:base-112},{x:cx-13,y:base-125},{x:cx+12,y:base-125},{x:cx+25,y:base-108},{x:cx+21,y:base-59},{x:cx+11,y:base-46},{x:cx-19,y:base-49},{x:cx-27,y:base-73}],cloth);
    poly([{x:cx-22,y:base-110},{x:cx-8,y:base-121},{x:cx+1,y:base-88},{x:cx-13,y:base-72},{x:cx-27,y:base-79}],primary,.95);
    poly([{x:cx+3,y:base-121},{x:cx+20,y:base-109},{x:cx+24,y:base-76},{x:cx+8,y:base-65},{x:cx-1,y:base-88}],shadow);
    g.lineStyle(3,trim,.9);g.lineBetween(cx-14,base-101,cx+13,base-75);
    g.lineStyle(2,primary,.9);g.lineBetween(cx-14,base-67,cx+18,base-67);
    g.fillStyle(0x101827,1);g.fillRoundedRect(cx-23,base-56,47,9,3);
    g.fillStyle(trim,1);g.fillRoundedRect(cx-4,base-58,10,12,2);
    // Arms react to attack / guard state
    const punch=f.attack>0?dir*(f.attackKind==='ultimate'?47:31):f.blocking?-dir*9:dir*4;
    g.lineStyle(15,shadow,1);g.lineBetween(cx-dir*16,base-108,cx+dir*punch,base-91);
    g.lineStyle(10,primary,1);g.lineBetween(cx-dir*16,base-108,cx+dir*punch,base-91);
    g.fillStyle(skin,1);g.fillCircle(cx+dir*punch,base-91,8);
    g.lineStyle(13,cloth,1);g.lineBetween(cx+dir*18,base-105,cx-dir*24,base-78);
    g.lineStyle(8,trim,.9);g.lineBetween(cx+dir*18,base-105,cx-dir*24,base-78);
    g.fillStyle(skin,1);g.fillCircle(cx-dir*24,base-78,7);
    // Neck and expressive face
    g.fillStyle(skin,1);g.fillRoundedRect(cx-7,base-132,14,15,4);
    g.fillStyle(skin,1);g.fillEllipse(cx,base-145,34,39);
    g.fillStyle(0x15182b,1);g.fillEllipse(cx+dir*2,base-151,34,20);
    if(isPlayer){
      poly([{x:cx-17,y:base-151},{x:cx-31,y:base-171},{x:cx-13,y:base-165},{x:cx-17,y:base-184},{x:cx-1,y:base-169},{x:cx+7,y:base-187},{x:cx+13,y:base-165},{x:cx+29,y:base-176},{x:cx+21,y:base-153},{x:cx+13,y:base-145},{x:cx-13,y:base-145}],character.hair);
      g.fillStyle(0x152d48,1);g.fillTriangle(cx-17,base-149,cx+18,base-149,cx+dir*29,base-139);
      g.fillStyle(0x13d8ed,1);g.fillCircle(cx+dir*7,base-145,3);
    }else{
      poly([{x:cx-17,y:base-151},{x:cx-34,y:base-169},{x:cx-16,y:base-165},{x:cx-20,y:base-185},{x:cx-3,y:base-169},{x:cx+7,y:base-188},{x:cx+14,y:base-165},{x:cx+32,y:base-174},{x:cx+22,y:base-151},{x:cx+14,y:base-142},{x:cx-13,y:base-142}],character.hair);
      g.fillStyle(0xf05b91,1);g.fillTriangle(cx-3,base-169,cx+7,base-188,cx+13,base-164);
      g.fillStyle(0x291327,1);g.fillRoundedRect(cx-17,base-143,34,12,4);
      g.lineStyle(2,0xff7ca8,1);g.lineBetween(cx-12,base-143,cx+12,base-143);
    }
    g.fillStyle(0x101426,1);g.fillEllipse(cx+dir*7,base-146,7,3);
    g.fillStyle(isPlayer?0x25dff4:0xff5b91,1);g.fillCircle(cx+dir*8,base-146,1.8);
    g.lineStyle(2,shadow,1);g.lineBetween(cx+dir*2,base-153,cx+dir*13,base-154);
    if(isPlayer){g.lineStyle(2,0x4ca9c4,.9);g.lineBetween(cx-17,base-139,cx-10,base-135);}
    g.fillStyle(primary,1);g.fillRoundedRect(cx+dir*17-5,base-106,13,17,4);
    g.lineStyle(2,trim,.9);g.strokeRoundedRect(cx+dir*17-5,base-106,13,17,4);
    g.fillStyle(trim,1);g.fillCircle(cx-dir*16,base-109,4);
    if(f.blocking){g.lineStyle(4,trim,.8);g.strokeCircle(cx,base-88,61);g.lineStyle(1,0xffffff,.6);g.strokeCircle(cx,base-88,68);}
    if(f.attack>0){
      const ultimate=f.attackKind==='ultimate', special=f.attackKind==='special';
      const color=ultimate?0xffffff:primary, radius=ultimate?170:special?118:f.attackKind==='heavy'?83:62;
      g.fillStyle(color,ultimate?.22:.12);g.fillCircle(cx+dir*radius*.38,base-91,radius*.55);
      g.lineStyle(ultimate?13:special?8:5,color,.88);
      g.beginPath();g.arc(cx+dir*12,base-92,radius,dir===1?-1.12:2.02,dir===1?.85:4.25);g.strokePath();
      g.lineStyle(2,trim,.9);g.lineBetween(cx+dir*22,base-116,cx+dir*(radius+28),base-136);
      if(ultimate){g.lineStyle(4,0xffffff,.55);g.strokeCircle(cx+dir*92,base-91,38+Math.sin(this.time.now/35)*9);}
    }
  }
  drawHud(){
    this.text(42,32,getCharacter(this.player.characterId).name.toUpperCase(),17,'#8cefff','Orbitron');this.text(1058,32,getCharacter(this.cpu.characterId).name.toUpperCase()+'  //  AI',17,'#ff8cac','Orbitron','right');
    this.bar(42,52,420,18,this.player.hp,0x35dfff);this.bar(638,52,420,18,this.cpu.hp,0xff477d,true);
    this.bar(42,78,260,8,this.player.energy,0x8e61ff);this.bar(798,78,260,8,this.cpu.energy,0xffa0c0,true);
    this.text(42,98,'RIFT ENERGY',10,'#9c9dbd','Orbitron');this.text(1058,98,'RIFT ENERGY',10,'#9c9dbd','Orbitron','right');
    this.text(550,45,String(Math.ceil(this.timeLeft)).padStart(2,'0'),28,'#fff','Orbitron','center');
    this.text(550,78,'ROUND 01',11,'#a8a5c9','Orbitron','center');
  }

  drawCharacterSelect(){
    this.g.fillStyle(0x050713,.82);this.g.fillRoundedRect(24,18,W-48,H-36,16);
    this.g.lineStyle(1,0x6253a5,.8);this.g.strokeRoundedRect(24,18,W-48,H-36,16);
    this.text(550,58,'CHOOSE YOUR FIGHTERS',28,'#f5f4ff','Orbitron','center');
    const prompt=this.selectionStep===0?'STEP 1 / 2  —  SELECT YOUR CHARACTER':this.selectionStep===1?'STEP 2 / 2  —  SELECT THE AI OPPONENT':'MATCHUP LOCKED  —  READY TO FIGHT';
    this.text(550,103,prompt,13,this.selectionStep===1?'#ff9cbd':'#78eaff','Orbitron','center');
    this.text(550,133,'CLICK A PORTRAIT CARD  •  36 FIGHTERS  •  7 ANIME WORLDS',10,'#9699bd','Orbitron','center');
    CHARACTERS.forEach((ch,i)=>{
      const col=i%6,row=Math.floor(i/6),x=37+col*171,y=164+row*51;
      const p1=ch.id===this.selectedPlayerId,p2=ch.id===this.selectedCpuId;
      this.g.fillStyle(p1?0x43201f:p2?0x1b2850:0x11162a,.96);
      this.g.fillRoundedRect(x,y,164,45,6);
      this.g.fillStyle(ch.color,1);this.g.fillRoundedRect(x,y,5,45,3);
      this.g.fillStyle(ch.dark,.9);this.g.fillCircle(x+25,y+22,15);
      this.g.lineStyle(2,ch.color,.95);this.g.strokeCircle(x+25,y+22,14);
      this.text(x+25,y+22,ch.short.slice(0,2),11,'#ffffff','Orbitron','center');
      this.text(x+47,y+15,ch.name,10,'#f2f2ff','Rajdhani');
      this.text(x+47,y+32,ch.series,8,'#9da5c8','Orbitron');
      if(p1){this.g.lineStyle(2,0xff665e,1);this.g.strokeRoundedRect(x-1,y-1,166,47,6);this.text(x+148,y+8,'P1',8,'#ff9b93','Orbitron','right');}
      if(p2){this.g.lineStyle(2,0x5d9dff,1);this.g.strokeRoundedRect(x-1,y-1,166,47,6);this.text(x+148,y+8,'AI',8,'#8ebdff','Orbitron','right');}
    });
    const p1=getCharacter(this.selectedPlayerId),p2=getCharacter(this.selectedCpuId);
    this.g.fillStyle(0x171426,.95);this.g.fillRoundedRect(38,484,480,47,7);
    this.g.fillStyle(p1.color,1);this.g.fillRect(38,484,5,47);
    this.text(54,499,'P1  //  YOU',9,'#ff9a91','Orbitron');
    this.text(54,518,p1.name.toUpperCase()+'  •  '+p1.title,11,'#f6f3ff','Rajdhani');
    this.g.fillStyle(0x14182b,.95);this.g.fillRoundedRect(582,484,480,47,7);
    this.g.fillStyle(p2.color,1);this.g.fillRect(582,484,5,47);
    this.text(598,499,'P2  //  AI OPPONENT',9,'#8ebdff','Orbitron');
    this.text(598,518,p2.name.toUpperCase()+'  •  '+p2.title,11,'#f6f3ff','Rajdhani');
    this.g.fillStyle(this.selectionStep===2?0x5035a7:0x28233f,.96);this.g.fillRoundedRect(398,545,304,48,8);
    this.g.lineStyle(2,this.selectionStep===2?0x9c80ff:0x5d527e,1);this.g.strokeRoundedRect(398,545,304,48,8);
    this.text(550,569,this.selectionStep===2?'START BATTLE  →':'SELECT BOTH FIGHTERS',14,this.selectionStep===2?'#ffffff':'#aaa8c7','Orbitron','center');
    this.text(550,610,'ESC  BACK TO MENU     •     CLICK P1 / P2 PANELS TO CHANGE YOUR PICKS',9,'#777d9f','Orbitron','center');
    this.ui.setScale(this.scale.width/W,this.scale.height/H);
  }

  drawMenu(){
    this.g.fillStyle(0x050713,.6);this.g.fillRect(0,0,W,H);
    this.text(550,115,'MOWA.exe PRESENTS',14,'#7e82b4','Orbitron','center');
    this.text(550,205,'ANIME RIFT',62,'#f4f5ff','Orbitron','center');
    this.text(550,258,'.exe',27,'#6deaff','Orbitron','center');
    this.text(550,315,'SEVEN ANIME WORLDS. ONE BATTLEFIELD.',16,'#aeb4d5','Rajdhani','center');
    this.g.lineStyle(1,0x6f54ff,.65);this.g.strokeRoundedRect(390,378,320,78,10);
    this.g.fillStyle(0x3a2c86,.6);this.g.fillRoundedRect(394,382,312,70,8);
    this.text(550,416,'ENTER THE RIFT  →',20,'#fff','Orbitron','center');
    this.text(550,492,'PICK YOUR FIGHTER  →  PICK YOUR AI OPPONENT',12,'#6deaff','Orbitron','center');
    this.text(550,516,'36 FIGHTERS  •  7 ANIME UNIVERSES',12,'#b4a6ed','Orbitron','center');
    this.text(550,540,'ONE PLAYER. ONE AI. NO RANDOM MATCHUPS.',12,'#ff7da4','Orbitron','center');
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
