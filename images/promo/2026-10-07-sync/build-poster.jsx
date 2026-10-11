#target illustrator
(function () {
  var root = new Folder('D:/CodeProjects/NPClassworks/images/promo/2026-10-07-sync');
  root.create();
  var W = 2560, H = 1080, notes = [];
  function log(s) { notes.push(s); var f = new File(root.fsName + '/build-log.txt'); f.open('w'); f.write(notes.join('\n')); f.close(); }
  var previous = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    var doc = app.documents.add(DocumentColorSpace.RGB, W, H);
    doc.rulerUnits = RulerUnits.Pixels;
    doc.artboards[0].name = 'NPClassworks / 同频 / 2560×1080';
    function layer(name) { var l = doc.layers.add(); l.name = name; return l; }
    function rgb(hex) { var c = new RGBColor(); c.red = parseInt(hex.substr(1,2),16); c.green = parseInt(hex.substr(3,2),16); c.blue = parseInt(hex.substr(5,2),16); return c; }
    function rect(l,x,y,w,h,color,opacity,radius) {
      var p = radius ? l.pathItems.roundedRectangle(H-y,x,w,h,radius,radius) : l.pathItems.rectangle(H-y,x,w,h);
      p.filled = !!color; p.stroked = false; if(color) p.fillColor = rgb(color); p.opacity = opacity===undefined ? 100 : opacity; return p;
    }
    function gradient(name,stops,radial) {
      var g=doc.gradients.add(); g.name=name; g.type=radial?GradientType.RADIAL:GradientType.LINEAR;
      while(g.gradientStops.length<stops.length)g.gradientStops.add();
      for(var i=0;i<stops.length;i++){var s=g.gradientStops[i];s.rampPoint=stops[i][0];s.color=rgb(stops[i][1]);s.opacity=stops[i][2]===undefined?100:stops[i][2];}
      var c=new GradientColor();c.gradient=g;return c;
    }
    function gradientFill(item,g,angle) { item.fillColor=g; item.filled=true; item.stroked=false; if(angle) item.rotate(angle,false,false,true,false,Transformation.CENTER); }
    function glow(l,cx,cy,w,h,color,opacity) {
      var p=l.pathItems.ellipse(H-(cy-h/2),cx-w/2,w,h);p.filled=true;p.stroked=false;
      var c=gradient('Atmosphere '+color+' '+cx+' '+cy,[[0,color,opacity],[42,color,opacity*.58],[100,color,0]],true);
      p.fillColor=c;return p;
    }
    function text(l,value,x,y,size,color,font,tracking) {
      var t=l.textFrames.add();t.contents=value;t.textRange.characterAttributes.textFont=app.textFonts.getByName(font||'MiSans-Heavy');
      t.textRange.characterAttributes.size=size;t.textRange.characterAttributes.fillColor=rgb(color||'#FFFFFF');
      if(tracking!==undefined)t.textRange.characterAttributes.tracking=tracking;
      t.position=[x,H-y];return t;
    }
    function fit(item,x,y,w,h) { var b=item.visibleBounds; item.resize(w/(b[2]-b[0])*100,h/(b[1]-b[3])*100);b=item.visibleBounds;item.translate(x-b[0],H-y-b[1]);return item; }
    function positionLetters(t,x,y,right) { var measure=t.duplicate();var outline=measure.createOutline();var b=outline.visibleBounds;var dx=right?x-b[2]:x-b[0];var dy=H-y-b[1];outline.remove();t.translate(dx,dy);return t; }
    function line(l,points,color,width,opacity) { var p=l.pathItems.add();p.setEntirePath(points);p.filled=false;p.stroked=true;p.strokeColor=rgb(color);p.strokeWidth=width;p.opacity=opacity||100;return p; }
    function orbit(l,cx,cy,rx,ry,start,end,color,width,opacity) {
      var pts=[];for(var i=0;i<=120;i++){var a=(start+(end-start)*i/120)*Math.PI/180;pts.push([cx+Math.cos(a)*rx,H-(cy+Math.sin(a)*ry)]);}
      return line(l,pts,color,width,opacity);
    }
    function blur(item,r) { try{item.applyEffect('<LiveEffect name="Adobe Gaussian Blur"><Dict data="R blr '+r+'"/></LiveEffect>');}catch(e){log('Blur: '+e);} }
    function importVector(file,l,x,y,w,h,white) {
      var src=app.open(new File(file));app.executeMenuCommand('selectall');app.executeMenuCommand('copy');
      app.activeDocument=doc;doc.activeLayer=l;doc.selection=null;app.executeMenuCommand('paste');
      var selected=doc.selection;var copied=[];for(var si=0;si<selected.length;si++)copied.push(selected[si]);
      var g=l.groupItems.add();for(var sj=copied.length-1;sj>=0;sj--)copied[sj].move(g,ElementPlacement.PLACEATBEGINNING);
      src.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=doc;doc.selection=null;
      if(white)for(var k=0;k<g.pathItems.length;k++){g.pathItems[k].fillColor=rgb('#ECFFF4');}
      fit(g,x,y,w,h);return g;
    }
    function screenshot(l,file,x,y,w,h,rotate) {
      var g=l.groupItems.add();g.name='Real application screenshot';
      for(var k=4;k>=1;k--){var shadow=rect(g,x-k*8,y+k*8,w+k*16,h+k*8,'#160905',10,18+k*4);blur(shadow,15+k*5);}
      var frame=rect(g,x-3,y-3,w+6,h+6,'#FFD7A7',45,17);
      var clip=g.pathItems.roundedRectangle(H-y,x,w,h,14,14);clip.filled=false;clip.stroked=false;
      var content=g.groupItems.add();var image=content.placedItems.add();image.file=new File(file);image.width=w;image.height=h;image.position=[x,H-y];image.embed();
      clip.move(content,ElementPlacement.PLACEATBEGINNING);clip.clipping=true;content.clipped=true;
      if(rotate)g.rotate(rotate,true,true,true,true,Transformation.CENTER);
      return g;
    }
    log('Started Illustrator '+app.version);
    var base=layer('01 / 黑铜背景');rect(base,0,0,W,H,'#100807');
    var air=layer('02 / 琥珀光场 · editable radial gradients');
    glow(air,1720,665,2100,1400,'#A84516',75);
    glow(air,1250,970,2700,590,'#F38635',78);
    glow(air,1880,350,1250,820,'#633717',45);
    glow(air,620,690,920,600,'#59301E',38);
    glow(air,1710,1020,1700,330,'#FFE2B5',44);
    var trajectories=layer('03 / 光轨 · editable paths');
    var halo=orbit(trajectories,1715,700,1125,620,185,360,'#F6A44C',7,34);blur(halo,17);
    orbit(trajectories,1715,700,1125,620,185,354,'#FFDDA9',1.2,46);
    orbit(trajectories,1715,700,1152,645,207,350,'#D58C59',.6,20);
    var curve=orbit(trajectories,1730,980,1550,370,178,347,'#FFD9AB',9,42);blur(curve,13);
    orbit(trajectories,1730,980,1550,370,180,345,'#FFF2DC',1.5,56);
    for(var j=0;j<23;j++){
      var sx=130+(j*193)%2330,sy=158+(j*j*73)%680;
      var dot=trajectories.pathItems.ellipse(H-sy,sx,j%5===0?3:1.3,j%5===0?3:1.3);dot.filled=true;dot.stroked=false;dot.fillColor=rgb('#FFE0B9');dot.opacity=j%5===0?50:23;
    }
    var english=layer('04 / NPCLASSWORKS · glass outline typography');
    var e=text(english,'NPCLASSWORKS',-60,820,290,'#FFD9AD','MiSans-Heavy',-38);var outlined=e.createOutline();fit(outlined,-124,835,2680,225);
    var glass=gradient('Glass / silver mint',[[0,'#FFF4E2',68],[28,'#EAB578',34],[60,'#613721',23],[100,'#FFE5C6',82]],false);
    for(var p=0;p<outlined.compoundPathItems.length;p++){var cp=outlined.compoundPathItems[p];for(var q=0;q<cp.pathItems.length;q++){var path=cp.pathItems[q];path.fillColor=glass;path.stroked=true;path.strokeColor=rgb('#FFD8A2');path.strokeWidth=.9;}}
    outlined.opacity=68;
    var ghost=outlined.duplicate(english,ElementPlacement.PLACEATEND);ghost.opacity=32;ghost.translate(0,-6);blur(ghost,8);
    var screens=layer('05 / 浮起的产品界面 · embedded screenshots');
    screenshot(screens,'D:/CodeProjects/NPClassworks/docs/ui2-optimization-20261003/teacher-1440.png',1260,176,900,625,3.3).opacity=86;
    screenshot(screens,'D:/CodeProjects/NPClassworks/docs/ui2-optimization-20261003/teacher-390.png',2240,298,260,562.6667,-3).opacity=98;
    screenshot(screens,'D:/CodeProjects/NPClassworks/docs/ui3-optimization-20261003/screen-1920.png',968,324,1280,720,0);
    var headline=layer('06 / 同频 · live MiSans Heavy type');
    var shadow=text(headline,'同频',133,261,335,'#E38843','MiSans-Heavy',-70);fit(shadow,72,254,743,336);shadow.opacity=23;blur(shadow,27);
    var title=text(headline,'同频',130,249,335,'#FFF0DB','MiSans-Heavy',-70);fit(title,66,249,743,336);
    var accent=rect(headline,75,633,83,5,'#F2B56B',100,2);
    var product=layer('07 / 产品标志');
    importVector('D:/CodeProjects/NPClassworks/images/branding/npclassworks-logo.svg',product,77,681,87,97,false);
    var name=text(product,'NPClassworks',190,704,45,'#FFE6C9','MiSans-Demibold',-10);positionLetters(name,190,704,false);
    var branding=layer('08 / 星火动力品牌');
    var mark=importVector('D:/Archives/文献集/NP/LOGO/星火动力0702.svg',branding,81,51,62,62,false);
    function recolor(item){if(item.typename==='PathItem'){item.fillColor=rgb('#FFEBD4');item.stroked=false;}else if(item.typename==='CompoundPathItem'){for(var i=0;i<item.pathItems.length;i++)recolor(item.pathItems[i]);}else if(item.typename==='GroupItem'){for(var i=0;i<item.pageItems.length;i++)recolor(item.pageItems[i]);}}
    recolor(mark);
    var word=importVector('D:/Archives/文献集/NP/LOGO/星火动力中文字黑色.svg',branding,161,51,133.53807228084,62,false);word.name='星火动力 / original vector wordmark';recolor(word);
    var url=text(branding,'novark.ink',2476,66,34,'#DCC4AB','MiSans-Regular',0);positionLetters(url,2476,66,true);
    var atmosphere=layer('09 / 地平线雾 · editable transparent gradients');
    glow(atmosphere,1600,1108,3000,330,'#FFD7A7',58);
    glow(atmosphere,1780,1088,1900,170,'#FFF1DD',45);
    var all=doc.groupItems.add();all.name='Artboard clipping / 2560×1080';
    // Export uses the artboard, while each named design layer remains independently editable.
    all.remove();
    for(var n=0;n<doc.layers.length;n++)if(doc.layers[n].pageItems.length===0)doc.layers[n].remove();
    doc.selection=null;doc.artboards.setActiveArtboardIndex(0);
    var opt=new IllustratorSaveOptions();opt.pdfCompatible=true;opt.compressed=true;opt.embedICCProfile=true;
    doc.saveAs(new File(root.fsName+'/NPClassworks-同频.ai'),opt);log('AI saved / '+doc.layers.length+' layers / '+doc.textFrames.length+' live text frames');
    var png=new ExportOptionsPNG24();png.antiAliasing=true;png.transparency=false;png.artBoardClipping=true;png.horizontalScale=100;png.verticalScale=100;
    doc.exportFile(new File(root.fsName+'/NPClassworks-同频.png'),ExportType.PNG24,png);log('PNG exported 2560x1080');
    try{
      var psd=new ExportOptionsPhotoshop();psd.resolution=72;psd.imageColorSpace=ImageColorSpace.RGB;psd.writeLayers=true;psd.writeTextEditability=true;psd.maximumEditability=true;psd.antiAliasing=true;psd.artboardRange='1';
      doc.exportFile(new File(root.fsName+'/NPClassworks-同频-中间.psd'),ExportType.PHOTOSHOP,psd);log('PSD exported');
    }catch(e){log('PSD export: '+e);}
    app.executeMenuCommand('fitall');doc.save();log('DONE');
  } catch(e) { log('ERROR at line '+e.line+': '+e); }
  finally {app.userInteractionLevel=previous;}
})();
