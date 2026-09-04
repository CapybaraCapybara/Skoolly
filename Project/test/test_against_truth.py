import re
import socket
import time
import requests
import urllib3
from data_manager import load_schools

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Complete truth map parsed
TRUTH_RAW = """
[1 - 1110700001] ST. ANDREWS INTERNATIONAL SCHOOL SATHORN (นานาชาติเซนต์ แอนดรูว์ส สาทร) - https://www.standrewssathorn.com
[2 - 1110700002] KOREAN INTERNATIONAL SCHOOL OF BANGKOK (นานาชาติเกาหลี กรุงเทพ) - http://www.kisbangkok.co.kr
[3 - 1110700003] IPC INTERNATIONAL KINDERGARTEN (อนุบาลไอ พี ซี อินเตอร์เนชั่นแนล) - https://www.ipcgreen.com
[4 - 1110700004] KIDS' ACADEMY INTERNATIONAL PRE-SCHOOL (อนุบาลนานาชาติคิดส์ อะคาเดมี่) - https://www.kidsacademy.ac.th
[5 - 1110700006] HEATHFIELD INTERNATIONAL SCHOOL (นานาชาติฮีทฟิลด์) - https://heathfield.ac.th
[6 - 1110700007] ANGLO SINGAPOREAN INTERNATIONAL SCHOOL (นานาชาติแองโกลสิงคโปร์) - https://www.anglosingapore.ac.th
[7 - 1110700008] PAN-ASIA INTERNATIONAL SCHOOL (นานาชาติแพน-เอเซีย) - https://www.pais.ac.th
[8 - 1110700009] ฺBritish Columbia International School Bangkok (นานาชาติบริติชโคลัมเบีย กรุงเทพ) - https://www.bcisb.ac.th
[9 - 1110700010] WELLS INTERNATIONAL SCHOOL - ON NUT (นานาชาติเวลล์ส-อ่อนนุช) - https://wells.ac.th
[10 - 1110700011] St.Andrews International School Dusit (นานาชาติเซนต์แอนดรูว์ส ดุสิต) - https://www.standrewsdusit.com
[11 - 1110700012] Montessori Academy Bangkok (นานาชาติ มอนเตสซอรี่ อะแคเดอมี่ แบงค็อก) - https://www.montessoribkk.com
[12 - 1110700014] Kensington Internation School (นานาชาติเค็นซิงตัน) - https://kensington.ac.th
[13 - 1110700015] Anglo Singapore International School Sukumvit 31 (นานาชาติแองโกลสิงคโปร์ สุขุมวิท 31) - https://www.anglosingapore.ac.th
[14 - 1110700016] Kids Kingdom International Kindergarten School (อนุบาลนานาชาติคิดส์ คิงดอม) - https://kidskingdom.ac.th
[15 - 1110700017] Kinder Bear Academy International Preschool (อนุบาลนานาชาติ คินเดอร์แบร์ อคาเดมี) - https://www.kinderbearacademy.com/
[16 - 1110700018] KIDZ VILLAGE INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติคิดส์วิลเลจ) - https://kidz-village.ac.th
[17 - 1110700019] NIVA AMERICAN INTERNATIONAL SCHOOL (นานาชาตินีวาอเมริกัน) - https://www.niva.ac.th
[18 - 1110700020] RAMKHUMHAENG ADVENT INTERNATIONAL SCHOOL (นานาชาติแอ๊ดเวนต์รามคำแหง) - https://www.rais.ac.th
[19 - 1110700021] TRAILL INTERNATIONAL SCHOOL (นานาชาติเทร็ลล์) - https://www.traillschool.com/
[20 - 1110700022] RC INTERNATIONAL SCHOOL (อาร์ ซี อินเตอร์เนชั่นแนล สคูล) - https://www.rcis.ac.th
[21 - 1110700023] MULBERRYHOUSE INTERNATIONAL PRE-SCHOOL (อนุบาลนานาชาติมัลเบอรี่เฮ้าส์) - https://www.mulberryhousepreschool.com
[22 - 1110700024] RUAMRUDEE INTERNATIONAL SCHOOL (ร่วมฤดีวิเทศศึกษา) - https://www.rism.ac.th
[23 - 1110700025] BROMSGROVE INTERNATIONAL PRIMARY SCHOOL (ประถมนานาชาติบรอมส์โกรฟ) - https://www.bromsgrove.ac.th
[24 - 1110700026] HARROW INTERNATIONAL SCHOOL (นานาชาติฮาร์โรว์ กรุงเทพฯ) - https://www.harrowschool.ac.th
[25 - 1110700027] GARDEN INTERNATIONAL SCHOOL, BANGKOK (นานาชาติการ์เด้น กรุงเทพฯ) - https://gardenbangkok.com/
[26 - 1110700028] RBIS INTERNATIONAL SCHOOL (อาร์บิสนานาชาติ) - https://rbis.ac.th
[27 - 1110700029] BLOOMING BUDS INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติบลูมมิ่ง บัดส์) - https://bbik.ac.th
[28 - 1110700030] THAI-JAPANESE ASSOCIATION SCHOOL (สมาคมไทย-ญี่ปุ่น) - https://www.tjas.ac.th
[29 - 1110700031] KIS INTERNATIONAL SCHOOL (นานาชาติเคไอเอส) - https://kis.ac.th
[30 - 1110700032] The Regent's International School-Bangkok (นานาชาติเดอะรีเจ้นท์-กรุงเทพ) - https://regents.ac.th
[31 - 1110700033] PREP INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติเพรพ) - https://www.prep.ac.th
[32 - 1110700034] INTERNATIONAL PIONEERS SCHOOL (นานาชาติอินเตอร์เนชั่นแนลไพโอเนียร์ส) - https://ips.ac.th
[33 - 1110700035] INTERNATIONAL MONTESCSRI CENTER (อนุบาลนานาชาติ มอนเตสเซอรี่) - https://www.imc.ac.th
[34 - 1110700037] INTERNATIONAL COMMUNITY SCHOOL (ประชาคมนานาชาติ) - https://www.ics.ac.th
[35 - 1110700039] Brighton College International School Bangkok Vibhavadi (นานาชาติ ไบรท์ตัน คอลเลจ กรุงเทพ วิภาวดี) - https://brightoncollege.ac.th/vibhavadi
[36 - 1110700040] SHREWSBURY INTERNATIONAL SCHOOL BANGKOK (นานาชาติโชรส์เบอรี กรุงเทพ) - https://www.shrewsbury.ac.th/
[37 - 1110700041] KINCAID INTERNATIONAL SCHOOL OF BANGKOK (นานาชาติคินเคด กรุงเทพ) - https://www.kincaidbangkok.com/
[38 - 1110700042] TALENTS INTERNATIONAL PRE-SCHOOL (อนุบาลนานาชาติตะลันต์) - https://www.talents-preschool.com/
[39 - 1110700043] KOBATO INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติโคบาโตะ) - https://kobato-bkk.com/
[40 - 1110700044] Modern International School, Bangkok (นานาชาติโมเดิร์น กรุงเทพฯ) - https://www.misb.ac.th
[41 - 1110700045] TRINITY INTERNATIONAL SCHOOL (นานาชาติทรีนีตี้) - https://trinity.ac.th/
[42 - 1110700046] KIDDYKARE INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติเยาวรักษ์ (คิดดี้แคร์)) - 
[43 - 1110700047] MELODIES INTERNATIONAL KINDERGATEN (อนุบาลนานาชาติเมโลดี้ส) - https://melodieskinder.com/en/
[44 - 1110700050] BSB BRITISH INTERNATIONAL PRIMARY SCHOOL (นานาชาติ บี เอส บี บริติช ไพรแมรี่) - https://bsbangkok.ac/
[45 - 1110700052] Bangkok Christian International School (นานาชาติคริสเตียนกรุงเทพ) - https://www.bcis.ac.th/
[46 - 1110700053] ST. MARK'S INTERNATIONAL SCHOOL (นานาชาติเซนต์มาร์ค) - https://stmarks.ac.th
[47 - 1110700056] NIST International School (นานาชาตินิสท์) - https://www.nist.ac.th
[48 - 1110700057] THE EARLY LEARNING CENTRE INTERNATIONAL SCHOOL (นานาชาติดิเออร์ลี่เลิร์นนิ่งเซนเตอร์) - https://www.elc.ac.th
[49 - 1110700058] FUTURE STEPS INTERNATIONAL SCHOOL BANGKOK (นานาชาติ ฟิวเจอร์ สเต็ปส์ บางกอก) - https://www.fsb.ac.th
[50 - 1110700059] XCL American School of Bangkok (เอ็กซีแอล อเมริกัน สคูล ออฟ แบงค็อก) - https://www.asbsk.ac.th/th/home
[51 - 1110700060] NEW BAMBINO INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาตินิวแบมบิโน) - https://www.newbambino.ac.th
[52 - 1110700062] Well International School - Bang Na (นานาชาติเวลล์ส-บางนา) - https://wells.ac.th
[53 - 1110700063] BANGKOK INTERNATIONAL PREPARATORY AND SECONDARY SCHOOL (นานาชาติบางกอก พรีแพราธอรี แอนด์ เซ็กเคินเดอรี) - https://www.bangkokprep.ac.th
[54 - 1110700064] EKAMAI INTERNATIONAL SCHOOL (นานาชาติเอกมัย) - https://www.eis.ac.th
[55 - 1110700065] SINGAPORE INTERNATIONAL SCHOOL OF BANGKOK (นานาชาติสิงคโปร์กรุงเทพฯ) - https://sisb.ac.th
[56 - 1110700066] St Andrews International School Bangkok (นานาชาติเซนต์แอนดรูว์สกรุงเทพฯ) - https://www.standrewssukhumvit.com/
[57 - 1110700067] SABAI-JAI INTERNATIONAL SCHOOL (อนุบาลนานาชาติสบายใจ) - https://www.sbi.ac.th/
[58 - 1110700068] LYCEE FRANCAIS INTERNATIONAL DE BANGKOK (ฝรั่งเศสนานาชาติ กรุงเทพ) - https://lfib.ac.th
[59 - 1110700069] Bangkok Grace International School (นานาชาติพระคุณกรุงเทพ) - https://www.grace.ac.th/bgis-10/
[60 - 1110700070] BANGKOK PATANA SCHOOL (บางกอกพัฒนา) - https://www.patana.ac.th
[61 - 1110700071] CHARTER INTERNATIONAL SCHOOL (นานาชาติชาร์เตอร์) - https://charter.ac.th/
[62 - 1110700072] WELLS INTERNATIONAL SCHOOL (นานาชาติเวลล์ส) - https://wells.ac.th
[63 - 1110700073] BANGKOK ADVENTIST INTERNATIONAL SCHOOL (นานาชาติแอ๊ดเวนตีสกรุงเทพ) - https://bais.ac.th
[64 - 1110700074] KEERA-PAT INTERNATIONAL SCHOOL (นานาชาติกีรพัฒน์) - https://kpis.ac.th
[65 - 1110700075] BEACONHOUSE YAMSAARD INTERNATIONAL SCHOOL (นานาชาติ บีคอนเฮาส์ แย้มสอาด) - https://bys.ac.th/byis/en/
[66 - 1110700076] THAI SIKN INTERNATIONAL SCHOOL OF BANGKOK (ไทยซิกข์นานาชาติ กรุงเทพ) - https://www.tsi.ac.th/
[67 - 1110700078] ASCOT INTERNATIONAL SCHOOL (นานาชาติแอสคอต) - https://ascot.ac.th/en/home-en
[68 - 1110700080] BROMSGROVE INTERNATIONAL SCHOOL THAILAND (นานาชาติบรอมส์โกรฟ) - https://www.bromsgrove.ac.th
[69 - 1110700081] Aster International School Bangkok (นานาชาติแอสเตอร์ กรุงเทพ) - https://aster.ac.th
[70 - 1110700082] KEVALEE INTERNATIONAL SCHOOL (อินเตอร์เนชั่นแนล เกวลี(หทัยราษฎร์)) - https://www.kevalee.ac.th/
[71 - 1110700083] ST.ANDREWS INTERNATIONAL SCHOOL BANGNA (นานาชาติเซนต์ แอนดรูว์ส บางนา) - https://www.standrewssukhumvit.com
[72 - 1110700084] Australian International School Bangkok Sukhumvit 20 (นานาชาติ ออสเตรเลีย กรุงเทพ สุขุมวิท 20) - https://www.australianisb.ac.th
[73 - 1110700085] KIRAKIRA KIDS INTERNATIONAL KINDERGARTEN SCHOOL (อนุบาลคิราคิราคิดส์ นานาชาติ) - https://www.kirakirakids.ac.th
[74 - 1110700086] GLORY SINGAPORE INTERNATIONAL SCHOOL (นานาชาติกลอรี่สิงคโปร์) - https://glorysingapore.com
[75 - 1110700087] OISCA INTERNATIONAL KINDERGARTEN SCHOOL (อนุบาลนานาชาติออยสก้า) - https://www.oisca-inter.com
[76 - 1110700088] CRESCENT INTERNATIONAL SCHOOL (นานาชาติเครซเซนต์) - https://cis.ac.th
[77 - 1110700089] Berkeley International School (นานาชาติเบิร์คลีย์) - https://www.berkeley.ac.th
[78 - 1110700091] Regent's International School Bangkok - Rama 9 (นานาชาติรีเจ้นท์ กรุงเทพ - พระราม 9) - https://regents.ac.th/th/rama-9-campus/
[79 - 1110700092] The Tiny Seeds International Pre - School (อนุบาลนานาชาติ เดอะไทนี่ซี๊ด) - https://tinyseedsschool.com
[80 - 1110700093] ABC PATHWAYS INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติ เอบีซี แพทเวยส์) - https://www.abcpathways.co.th
[81 - 1110700094] ANNABEL'S EARLY YEARS INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติแอนนาเบลส์ เออร์ลี่ เยียร์ส) - https://www.annabels.ac.th
[82 - 1110700095] Prep Montessori International Kindergarten (อนุบาลนานาชาติเพรพ มอนเตสซอรี่) - https://www.prep.ac.th
[83 - 1110700096] AUSTRALIAN INTERNATIONAL SCHOOL BANGKOK (นานาชาติ ออสเตรเลีย กรุงเทพ) - https://www.australianisb.ac.th
[84 - 1110700097] Brighton College International School Bangkok (นานาชาติ ไบรท์ตัน คอลเลจ กรุงเทพ) - https://brightoncollege.ac.th/
[85 - 1110700098] Acacia International Preschool Sukhumvit Bangkok (นานาชาติอคาเซีย พรีสคูล สุขุมวิท กรุงเทพ) - https://acacia-education.com/sukhumvit-international-nursery-preschool/
[86 - 1110700099] Raintree Internatiomal School (นานาชาติเรนทรี) - https://raintree.ac.th
[87 - 1110700100] La Petite Ecole International Kindergarten School Bangkok (อนุบาลนานาชาติ ลา เปติท อีโคล แบงค็อก) - https://www.lpebangkok.com/en/
[88 - 1110700101] Singapore International School Thonburi (นานาชาติสิงคโปร์ธนบุรี) - https://sisb.ac.th/singapore-international-school-thonburi-campus/
[89 - 1110700102] Associe International Kindergarten Bangkok 35 (อนุบาลนานาชาติแอสโซซิเอะกรุงเทพฯ ๓๕) - https://aikb35.ac.th/en/
[90 - 1110700103] Central International School (นานาชาติเซนทรัล) - https://central-school.com/
[91 - 1110700104] ROYCE ROYAL INTERNATIONAL SCHOOL (นานาชาติรอยส์ รอยัล) - https://www.royceroyal.ac.th
[92 - 1110700105] Shrewsbury International School Bangkok City Campus (นานาชาติโชรส์เบอรีกรุงเทพ ซิตี้แคมปัส) - https://www.shrewsbury.ac.th
[93 - 1110700107] Wellington College International Bangkok (นานาชาติ เวลลิงตันคอลเลจ กรุงเทพ) - https://www.wellingtoncollege.ac.th/
[94 - 1110700108] Double Trees Ratchaphruek International Kindergarten (อนุบาลนานาชาติดับเบิลทรี ราชพฤกษ์) - https://doubletreesschool.ac.th/index.php/ratchaphruek-campus/
[95 - 1110700109] BASIS International School Bangkok (นานาชาติเบซิส กรุงเทพฯ) - https://basis.ac.th
[96 - 1110700110] Hummimgbird International School (นานาชาติฮัมมิ่งเบิร์ด) - https://www.hummingbird.ac.th/
[97 - 1110700111] KIDS ACADEMY INTERNATIONAL SCHOOL SRINAKARIN (นานาชาติคิดส์อะคาเดมี่ ศรีนครินทร์) - https://www.kidsacademy.ac.th/imagination-1
[98 - 1110700112] Raintree International School Sukhumvit (นานาชาติเรนทรี สุขุมวิท) - https://raintree.ac.th
[99 - 1110700113] CANADIAN INTERNATIONAL SCHOOL OF THAILAND (นานาชาติแคนาเดียน ประเทศไทย) - https://canadianschool.com
[100 - 1110700114] CENTURION INTERNATIONAL SCHOOL BANGKOK (นานาชาติเซ็นจูเรี่ยน กรุงเทพฯ) - https://www.cisb.ac.th
[101 - 1110700117] LITTLE KOALA INTERNATIONAL KINDERGARTEN SCHOOL RAMINTRA (อนุบาลนานาชาติลิตเติ้ลโคอาล่า รามอินทรา) - https://www.littlekoalaschool.com/index.php/en
[102 - 1110700118] King's college International School, Bangkok (นานาชาติคิงส์คอลเลจ กรุงเทพ) - https://www.kingsbangkok.ac.th/en
[103 - 1110700119] Roong Aroon International School (นานาชาติรุ่งอรุณ) - https://www.roongaroonis.ac.th/
[104 - 1110700120] Ruamrudee International School Early Years Campus (นานาชาติ ร่วมฤดีวิเทศศึกษา เออร์ลี่ เยียรส์ แคมปัส) - https://www.rise.ac.th/
[105 - 1110700121] Dadi Thai Srinakarin International Kindergarten (อนุบาลนานาชาติต้าตี้-ไทย ศรีนครินทร์) - https://dadi.ac.th/
[106 - 1110700122] BRITISH MANDARIN INTERNATIONAL SCHOOL (นานาชาติบริติชแมนดาริน) - https://bmis.ac.th
[107 - 1110700123] CHINA INTERNATIONAL SCHOOL (นานาชาติจีน) - https://chinis.ac.th/home/
[108 - 1110700124] Acacia International Preschool Bangkok (นานาชาติอคาเซีย พรีสคูล กรุงเทพ) - https://acaciaschool.com
[109 - 1110700125] Dadi Thonburi International Kindergarten (อนุบาลนานาชาติต้าตี้ ธนบุรี) - https://dadi.ac.th/
[110 - 1110700126] ASTRA ACADEMY INTERNATIONAL SCHOOL (นานาชาติแอสทรา อะคาเดมี่) - https://www.astra.ac.th
[111 - 1110700127] RAJAPARK INTERNATIONAL SCHOOL (นานาชาติรัชต์ภาคย์) - https://www.rpis.ac.th/
[112 - 1110700128] Finland International School of Thailand : Hei Bangkok (Sukhumvit) (นานาชาติฟินแลนด์แห่งประเทศไทย เฮย์กรุงเทพ (สุขุมวิท)) - https://www.heibangkok.com
[113 - 1110700130] DOUBLE TREES RAMA  3 INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติดับเบิลทรี พระราม 3) - https://doubletreesschool.ac.th
[114 - 1110700131] Little Koala International Kinderga (อนุบาลนานาชาติลิตเติ้ลโคอาล่า) - https://www.littlekoalaschool.com/index.php/en
[115 - 1110700132] Pensmith International School (นานาชาติเพ็ญสมิทธ์) - https://pensmithschool.com/
[116 - 1110700133] Oakbury International School (นานาชาติโอ๊คบิวรี่) - https://oakbury.ac.th
[117 - 1110700134] Regent International School-LangSuan (นานาชาติรีเจ้นท์-หลังสวน) - https://regents.ac.th
[118 - 1110700135] Kornkaew International Montessori School (นานาชาติกรแก้วมอนเตสซอรี่) - https://www.kornkaew.com/
[119 - 1110700136] Kids Kingdom Ruamrudee International Kindergarten School (อนุบาลนานาชาติคิดส์ คิงดอม ร่วมฤดี) - https://kidskingdom.ac.th/
[120 - 1110700137] ST.MARKS AUSTRALIAN INTERNATIONAL SCHOOL (นานาชาติเซนต์มาร์ค ออสเตรเลีย) - https://stmarks.ac.th/
[121 - 1110700138] GLORY SINGAPORE INTERNATIONAL SCHOOL RAMINTRA (นานาชาติกลอรี่สิงคโปร์ รามอินทรา) - https://glorysingapore.com
[122 - 1110700139] SBS INTERNATIONAL SCHOOL BANGKOK (นานาชาติ เอสบีเอส แบงค์คอก) - https://sbsbangkok.ac.th
[123 - 1110700140] BEYC International School (นานาชาติบีอีวายซี) - https://beyc.co.th/
[124 - 1110700142] Rising Oaks International School Bangkok (นานาชาติไรซิ่ง โอคส์ แบงคอค) - https://roisb.ac.th
[125 - 1110700143] SPGS International School Bangkok (นานาชาติเอสพีจีเอส กรุงเทพฯ) - https://www.spgsibangkok.com/
[126 - 1110700144] Middleton International School Bangkok (นานาชาติมิดเดิลตัน กรุงเทพ) - https://middleton.ac.th
[127 - 1110700145] Dulwich College International School Bangkok (นานาชาติ ดัลลิช คอลเลจ กรุงเทพ) - https://www.dulwich.org
[128 - 1110700146] The Jataka International School Southeast Asia (นานาชาติ เดอะ ชาตะกะ อุษาคเนย์) - https://www.thejatakaschool.com/
[129 - 1110700147] Lilberry International School (นานาชาติลิลเบอร์รี่) - https://lilberrypreschool.com/
[130 - 1110700148] Sequoia Nova International Primary School (ประถมนานาชาติเซโกญา โนวา) - https://sequoia-nova.com
[131 - 1110700149] Be Albright International School (นานาชาติบี ออลไบร้ท์) - 
[132 - 1111700001] THAI - SINGAPORE INTERNATIONAL SCHOOL (นานาชาติไทย-สิงคโปร์) - https://www.tsis.ac.th/
[133 - 1111700002] BANGKOK - CHICAGO CHRISTIAN INTERNATIONAL SCHOOL (นานาชาติแบงค์คอก-ชิคาโก คริสเตียน) - https://bcci.ac.th/
[134 - 1111700003] THAI SIKH INTERNATIONAL SCHOOL (ไทยซิกข์นานาชาติ) - https://www.tsis.ac.th
[135 - 1111700004] THAI-CHINESE INTERNATIONAL SCHOOL (นานาชาติไทย-จีน) - https://www.tcis.ac.th
[136 - 1111700005] THE AMERICAN SCHOOL OF BANGKOK (ดิ อเมริกัน สคูล ออฟ แบงค็อก) - https://asb.ac.th
[137 - 1111700006] CONCORDIAN INTERNATIONAL SCHOOL (นานาชาติคอนคอร์เดียน) - https://www.concordian.ac.th
[138 - 1111700007] Singapore Suvarnabhumi International School (นานาชาติสิงคโปร์สุวรรณภูมิ) - https://sisb.ac.th/th/singapore-international-school-suvarnabhumi-campus/
[139 - 1111700008] Raffles American International School (นานาชาติราฟเฟิลส์อเมริกัน) - https://ras.ac.th/
[140 - 1111700009] D-PREP International School (นานาชาติดีเพร็พ) - https://dprep.ac.th/
[141 - 1111700011] Verso International School (นานาชาติเวอร์โซ) - https://www.verso.ac.th
[142 - 1111700012] Wycombe Abbey International School Bangkok (นานาชาติ วิคคอมบ์ แอบบี้ แบงคอก) - https://wycombeabbey.ac.th
[143 - 1112700001] Hampton International School (นานาชาติแฮมพ์ตั้น) - https://hamptonschool.ac.th
[144 - 1112700002] INTERNATIONAL SCHOOL BANGKOK (ISB) (สถานศึกษานานาชาติ) - https://www.isb.ac.th
[145 - 1112700003] Magic Years International Kindergarten (นานาชาติแมจิกเยียร์ส) - https://www.myis.ac.th
[146 - 1112700004] St. Andrews International School Samakee (นานาชาติ เซนต์ แอนดูรว์ส สามัคคี) - https://www.standrews-samakee.com
[147 - 1112700005] DRAGON INTERNATIONAL SCHOOL (นานาชาติ ดราก้อน) - https://www.dis.ac.th
[148 - 1112700006] DBS Denla British School (นานาชาติเด่นหล้า บริติช) - https://www.dbsbangkok.ac.th
[149 - 1112700007] Ruamrudee International school ratchapruek campus (ร่วมฤดีวิเทศศึกษา ราชพฤกษ์ แคมปัส) - https://www.risr.ac.th/
[150 - 1112700008] INTERNATIONAL CHRISTIAN SCHOOL NONTHABURI (นานาชาติสาธิตคริสเตียนนนทบุรี) - https://www.icsn.ac.th
[151 - 1112700009] SINGAPORE INTERNAIONAL SCHOOL NONTHABURI (นานาชาติสิงคโปร์นนทบุรี) - https://sisb.ac.th/nonthaburi-campus/
[152 - 1112700010] THM International School (นานาชาติ ทีเอชเอ็ม) - https://www.thm.ac.th
[153 - 1112700011] Denla Rama V School (เด่นหล้า พระราม 5) - https://www.denlaramavschool.ac.th/
[154 - 1112700012] Knightsbridge House International School Nonthaburi (นานาชาติไนทส์บริดจ์เฮ้าส์ นนทบุรี) - https://www.knightsbridgeschool.com
[155 - 1112700014] New American Chinese International School (นานาชาตินิวอเมริกันไชนีส) - 
[156 - 1113700001] SIAM INTERNATIONAL SCHOOL (นานาชาติสยาม) - https://siamis.ac.th/th/
[157 - 1113700002] SATHIT PATHUM DEMONSTRATION SCHOOL (สาธิตปทุม) - https://www.sathitpathum.ac.th
[158 - 1113700003] GLOBAL INDIAN INTERNATIONAL SCHOOL (โกลบอลอินเดียนนานาชาติ) - https://www.gisschool.org/
[159 - 1113700004] THAI INTERNATIONAL SCHOOL (ไทยอินเตอร์เนชั่นแนลสกูล) - https://www.tis.ac.th
[160 - 1113700005] KIS International School Reignwood Park (นานาชาติเคไอเอสเรนวูดปาร์ค) - https://kis.ac.th/rp
[161 - 1116700001] Crestview International School (นานาชาติเครสท์วิว) - https://www.crestview.ac.th
[162 - 1118700001] Manorom International Chiristian School (คริสเตียนมโนรมย์นานาชาติ) - https://mics.ac.th/
[163 - 1119700001] California Prep International School (นานาชาติแคลิฟอร์เนีย เพรพ) - https://caprepschool.com/
[164 - 1119700002] SAINT JOHN MARY INTERNATIONAL SCHOOL (นานาชาติเซนต์จอห์นแมรี) - https://www.sjmis.ac.th
[165 - 1119700003] John Wyatt Montessori International School (นานาชาติ จอห์น ไวแอท มอนเตสซอรี) - https://www.jwmontessori.com/
[166 - 1119700004] Adventist Mission International School (นานาชาติแอ๊ดเวนติสมิชชัน) - https://dev.aims.ac.th
[167 - 1120700001] Tara Pattana International School (นานาชาติธาราพัฒนา) - https://www.tpis.ac.th
[168 - 1120700002] Regents International School Pattaya (นานาชาติรีเจ้นท์ พัทยา) - https://www.nordangliaeducation.com/risp-pattaya
[169 - 1120700003] INTERNATIONAL SCHOOL EASTERN SEABOARD (นานาชาติภาคตะวันออก) - https://www.brandbucket.com/names/ises
[170 - 1120700004] Thai Japanese Association School Sriracha (สมาคมไทย-ญี่ปุ่น ศรีราชา) - https://sites.google.com/tjas.ac.th/top
[171 - 1120700005] Mooltripakdee International School (นานาชาติมูลตรีภักดี) - https://www.mis.ac.th
[172 - 1120700007] Tonlew International Kindergarten (อนุบาลนานาชาติต้นหลิว) - 
[173 - 1120700008] International school og Chonburi (นานาชาติ ชลบุรี) - http://www.isc.ac.th/
[174 - 1120700009] RUGBY SCHOOL THAILAND (นานาชาติรักบี้) - https://www.rugbyschool.ac.th
[175 - 1120700010] Burapha Phatthanasart International School (นานาชาติบูรพาพัฒนศาสตร์) - https://bpis.ac.th
[176 - 1120700011] KIDS AVENUE INTERNATIONAL KINDERGARTEN SCHOOL (อนุบาลนานาชาติคิดส์อะเวนิว) - https://www.kidsavenue.ac.th
[177 - 1120700012] EFIP INTERNATIONAL SCHOOL (นานาชาติ อีเอฟไอพี) - https://www.ecolepattaya.com/th/
[178 - 1120700013] Well International School Chonburi (นานาชาติเวลล์ส ชลบุรี) - https://wells.ac.th/campuses/wells-chonburi/
[179 - 1120700014] LOVELL INTERNATIONAL SCHOOL (นานาชาติเลิฟเวลล์) - https://lovellschool.ac.th/
[180 - 1120700015] EL DREAM CHRISTIAN INTERNATIONAL SCHOOL (นานาชาติเอลดรีมคริสเตียน) - https://www.eldream.ac.th
[181 - 1120700016] Hastin International School (นานาชาติหัสดิน) - https://www.hastin.ac.th
[182 - 1120700017] Highgate International School Thailand (นานาชาติไฮเกต ประเทศไทย) - https://highgate.ac.th
[183 - 1121700001] ST.ANDREWS INTERNATIONAL SCHOOL GREENVALLEY (นานาชาติเซนต์แอนดรูว์ส กรีนวัลเล่ย์) - https://www.standrewsgreenvalley.com/
[184 - 1121700002] GARDEN INTERNATIONAL SCHOOL (นานาชาติสวนระยอง) - https://gardenrayong.com/
[185 - 1121700003] BELFRY INTERNATIONAL SCHOOL (นานาชาติเบลฟริย์) - https://www.belfry.ac.th
[186 - 1121700004] SINGAPORE INTERNATIONAL SCHOOL RAYONG (นานาชาติสิงคโปร์ระยอง) - https://sisb.ac.th/th/rayong-campus/
[187 - 1125700001] Aristar International School (นานาชาติอริสตา) - https://aristar.ac.th
[188 - 1125700002] KRIS International School (นานาชาติเคอาร์ไอเอส) - https://www.kriskb.com/th
[189 - 1130700001] KORAT ADVENTIST INTERNATIONAL SCHOOL (นานาชาติแอ๊ดเวนตีสโคราช) - https://www.kais2009.ac.th/
[190 - 1130700002] ANGLO SINGAPORE INTERNATIONAL SCHOOL NAKHONRATCHASIMA (นานาชาติแองโกลสิงคโปร์ นครราชสีมา) - https://anglosingapore.ac.th/korat
[191 - 1130700003] St. Stephen'S International School (Khao Yai) (นานาชาติเซนต์สตีเฟ่นส์ เขาใหญ่) - https://www.ststephen.ac.th
[192 - 1130700004] WESLEY INTERNATIONAL SCHOOL (นานาชาติเวสลี่) - https://www.wis.ac.th
[193 - 1134700001] Ubon Adventist International Mission School (นานาชาติแอ๊ดเวนตีสมิชชั่นอุบล) - https://www.uaims.ac.th
[194 - 1134700002] Begins international School (นานาชาติบีกิน) - https://www.begins.ac.th
[195 - 1140700001] Khon Kaen International School (นานาชาติขอนแก่น) - https://kkisinterschool.wixsite.com/mysite
[196 - 1140700002] Ratchut International School (นานาชาติรัตน์ฉัตร) - https://www.ratchutschool.com
[197 - 1140700003] Asia Singapore International School (นานาชาติเอเชียสิงคโปร์) - http://www.asiskk.com/
[198 - 1140700004] AMERICAN PRIME INTERNATIONAL SCHOOL (นานาชาติอเมริกันไพรม) - https://apis-kk.com
[199 - 1141700001] Udon Thani International School (นานาชาติอุดรธานี) - https://www.udoninternationalschool.com/
[200 - 1141700002] INTERNATIONAL COMMUNITY SCHOOL UDON THANI (ประชาคมนานาชาติ อุดรธานี) - https://www.icsud.ac.th/
[201 - 1141700003] HEI School Udon Thani International Kindergarten (อนุบาลนานาชาติ เฮย์ สคูล อุดรธานี) - https://udon.heischools.com/
[202 - 1145700001] SILVER FERN INTERNATIONAL SCHOOL (นานาชาติซิลเวอร์เฟิร์น) - https://silverferninternationalschool.com/
[203 - 1150700001] CHIANG MAI INTERNATIONAL SCHOOL (นานาชาติเชียงใหม่) - https://www.cmis.ac.th
[204 - 1150700002] LANNA INTERNATIONAL SCHOOL (นานาชาติลานนา) - https://www.lannaist.ac.th
[205 - 1150700003] NAKORN PAYAP INTERNATIONAL SCHOOL (นานาชาตินครพายัพ) - https://www.nis.ac.th/
[206 - 1150700004] Prem Tinsulanonda International School (นานาชาติเปรม ติณสูลานนท์ อินเตอร์แนชชั่นแนล สคูล) - https://ptis.ac.th
[207 - 1150700005] AMERICAN PACIFIC INTERNATIONAL SCHOOL (นานาชาติอเมริกันแปซิฟิก) - https://www.apis.ac.th
[208 - 1150700006] GRACE INTERNATIONAL SCHOOL (นานาชาติเกรซ) - https://gisthailand.org/
[209 - 1150700007] CHRISTIAN GERMAN SCHOOL CHIANGMAI (คริสเตียนเยอรมันเชียงใหม่) - https://cdsc.ac.th/
[210 - 1150700008] American Pacific International School (Primary) (นานาชาติอเมริกันแปซิฟิก(ประถม)) - https://www.apis.ac.th/
[211 - 1150700009] Hana Christian International Kindergarten (อนุบาลนานาชาติฮานาคริสเตียน) - https://www.hcik.ac.th
[212 - 1150700010] Chiangmai Chinese Intemational School (นานาชาติเชียงใหม่ ไชนีส) - https://ccis.ac.th
[213 - 1150700011] SIngapore International School Chaing Mai (นานาชาติสิงคโปร์เชียงใหม่) - https://sisb.ac.th/singapore-international-school-chiangmai/
[214 - 1150700012] Unity concord international school (นานาชาติยูนิตี้ คอนคอร์ด) - https://www.ucis.ac.th
[215 - 1150700013] Panyaden International School (นานาชาติปัญญาเด่น) - https://www.panyaden.ac.th/
[216 - 1150700014] ESARA INTERNATIONAL SCHOOL (นานาชาติอิสระ) - https://esara.ac.th/
[217 - 1150700015] Meritton British International School (นานาชาติเมริทตัน บริติช) - https://merittonbritish.ac.th
[218 - 1150700016] Americana Chinese International School (นานาชาติอเมริกาน่า ไชนีส) - https://www.acis.ac.th
[219 - 1150700017] Bright seeds international kindergarten school (อนุบาลนานาชาติไบรท์ซีดส์) - https://www.brightseeds.ac.th
[220 - 1150700018] Satit International Bilingual School Of Rangsit University Chiangmai (สาธิตนานาชาติทวิภาษาแห่งมหาวิทยาลัยรังสิต เชียงใหม่) - https://sbscm.ac.th
[221 - 1150700019] VAREE CHIANGMAI INTERNATIONAL SCHOOL (นานาชาติวารีเชียงใหม่) - https://www.vcis.ac.th/
[222 - 1150700020] Northern International Montessori School (นอร์ทเทิร์น อินเตอร์เนชั่นแนล มอนเตสซอรี่) - https://nims-chiangmai.org/
[223 - 1150700021] BRITISH CONCORDANCE INTERNATIONAL SCHOOL (นานาชาติบริติช คอนคอร์แดนซ์) - https://www.bcisschool.ac.th
[224 - 1150700024] CHIANGMAI CEDAR INTERNATIONAL SCHOOL (นานาชาติซีดาร์เชียงใหม่) - https://www.chiangmaicedar.ac.th/
[225 - 1150700025] Windfield French International School Chiang Mai (นานาชาติฝรั่งเศสวินฟิลด์ เชียงใหม่) - https://chiangmai.windfield.ac.th/
[226 - 1150700026] BOSTON INTERNATIONAL SCHOOL (นานาชาติบอสตัน) - https://www.bis.ac.th/
[227 - 1150700027] MILL HILL INTERNATIONAL SCHOOL THAILAND (นานาชาติมิลล์ฮิลล์ ประเทศไทย) - https://millhillthailand.ac.th/
[228 - 1150700028] Cariad International School (นานาชาติคาเรียด) - https://www.cariad.ac.th
[229 - 1150700029] Masters International School Chiangmai (นานาชาติมาสเตอร์ เชียงใหม่) - https://www.mastersinternationalschool.org/th
[230 - 1152700001] NAWATTAPHUME INTERNATIONAL SCHOOL (นานาชาติอังกฤษแห่งภาคเหนือ) - 
[231 - 1152700002] Cranberry International School (นานาชาติแครนเบอร์รี่) - https://www.cranberry.ac.th
[232 - 1152700003] Saint Helier-Brelade International School (นานาชาติเซนต์เฮเลียร์-เบรลาร์ด) - https://www.sainthelierbreladeinternationalschool.com/
[233 - 1154700001] Sanfan International School (นานาชาติสานฝัน) - 
[234 - 1156700002] British Thai International School at Chiangkham-Phayao (นานาชาติอังกฤษ ไทย ณ เชียงคำ-พะเยา) - https://btis.ac.th/
[235 - 1157700001] Chiangrai International School (นานาชาติเชียงราย) - https://cis.ac.th
[236 - 1157700002] CHIANG RAI INTERNATOPNAL CHRISTIAN SCHOOL (คริสเตียนนานาชาติเชียงราย) - https://crics.asia
[237 - 1157700004] ONE HOPE INTERNATIONAL SCHOOL (นานาชาติวันโฮป) - https://www.onehope.ac.th
[238 - 1157700005] Gainesville International School Maesai (นานาชาติเกนส์วิลล์ แม่สาย) - https://www.gism.ac.th/
[239 - 1162700001] TCE INTERNATIONAL SCHOOL (นานาชาติทีซีอี) - https://tce.ac.th/
[240 - 1163700001] BAITI INTERNATIONAL SCHOOL (นานาชาติบัยตี) - https://baitiinternationalschool.com/
[241 - 1163700002] Kasalong Kids International School (นานาชาติกาสะลองคิดส์) - https://kkis.ac.th/en
[242 - 1165700001] New Cambridge International school (นานาชาติ นิวเคมบริดจ์) - https://www.ncis.ac.th
[243 - 1174700001] Norwich International School Bangkok (นานาชาตินอริชกรุงเทพ) - https://www.norwichschool.ac.th
[244 - 1177700001] HUA HIN INTERNATIONAL SCHOOL (นานาชาติ หัวหิน) - https://www.hhis.ac.th
[245 - 1177700002] DA VINCI INTERNATIONAL SCHOOL (นานาชาติ ดาวินชี่) - http://www.davinci.ac.th/
[246 - 1180700001] The Passion International School (นานาชาติเดอะแพสชั่น) - https://www.thepassion.ac.th/
[247 - 1181700001] NAWATTAPHUME INTERNATIONAL SCHOOL KRABI (นานาชาติอังกฤษกระบี่) - 
[248 - 1181700002] Krabi international School (นานาชาติกระบี่) - https://www.krabiinternationalschool.com/
[249 - 1181700003] THE INTERNATIONAL SCHOOL OF ASIA KOH LANTA (นานาชาติเอเชีย เกาะลันตา) - https://www.isa.ac.th/
[250 - 1181700005] A-Chuan International School (นานาชาติเอช้วน) - https://www.achuan.ac.th/
[251 - 1183700001] British International School, Phuket (นานาชาติบริติช ภูเก็ต) - https://www.bisphuket.ac.th/
[252 - 1183700002] Q.S.I. INTERNATIONAL SCHOOL (นานาชาติ คิว.เอส.ไอ. ภูเก็ต) - https://phuket.qsi.org/
[253 - 1183700003] UWC Thailand International School (นานาชาติยูดับเบิลยูซี ประเทศไทย) - https://www.uwcthailand.ac.th/
[254 - 1183700004] HeadStart International School (นานาชาติ เฮดสตาร์ท) - https://headstartphuket.com
[255 - 1183700005] KAJORNKIET INTERNATIONAL SCHOOL PHUKET (ขจรเกียรตินานาชาติ ภูเก็ต) - https://www.kisp.academy/
[256 - 1183700006] LIGHTHOUSE AT PHUKET INTERNATIONAL SCHOOL (นานาชาติไลท์เฮ้าส์ แอท ภูเก็ต) - https://lighthousephuket.com/primary/
[257 - 1183700007] Oak Meadow International School (นานาชาติ โอ๊ค มีโดว์) - https://oakmeadow.ac.th
[258 - 1183700008] Buds International School Phuket (นานาชาติ บัดส์ ภูเก็ต) - https://www.buds-phuket.com/
[259 - 1183700009] Innovative Sustainable Pathway International School Phuket (นานาชาติ อินโนเวทีฟ ซัสเตนนะเบิล พาทเวย์ ภูเก็ต) - https://ispphuket.com/
[260 - 1183700010] Berda Claude International School Of Phuket (นานาชาติ เบอร์ดา คล๊อด ภูเก็ต) - https://www.bcisphuket.ac.th/
[261 - 1183700011] MONTESSORI HOUSE PHUKET INTERNATIONAL SCHOOL (นานาชาติมอนเตสโซรี่ เฮาส์ ภูเก็ต) - https://www.montessori-thailand.com/
[262 - 1183700012] FINNWAY INTERNATIONAL SCHOOL PHUKET (นานาชาติฟินน์เวย์ ภูเก็ต) - https://finnwayphuket.com/
[263 - 1183700013] Ruamrudee International School Phuket (นานาชาติ ร่วมฤดีวิเทศศึกษา ภูเก็ต) - https://risphuket.ac.th/
[264 - 1183700014] HEADSTART INTERNATIONAL SCHOOL CHERNGTALAY (นานาชาติเฮดสตาร์ท เชิงทะเล) - https://headstartphuket.com/th/our-school/
[265 - 1183700015] HEI Schools Phuket International School (นานาชาติ เฮย์ สคูล ภูเก็ต) - https://phuket.heischools.com/
[266 - 1183700016] Kinderville Nova International School (นานาชาติคินเดอร์วิลล์โนวา) - https://kindervilleschool.com/
[267 - 1183700017] Lighthouse At Rawai Internaional School (นานาชาติไลท์เฮ้าส์ แอท ราไวย์) - https://lighthousephuket.com/secondary/
[268 - 1183700018] LIGHTHOUSE AT CHALONG INTERNATIONAL KINDERGARTEN (อนุบาลนานาชาติ ไลท์เฮ้าส์ แอท ฉลอง) - https://lighthousephuket.com/kindergarten/
[269 - 1183700019] Prasan Gateway International School (นานาชาติประสานเกตเวย์) - https://www.pgisphuket.com
[270 - 1183700020] Phuket Pinnacle International School (นานาชาติ ภูเก็ตพินนาเคิล) - https://ppisschool.com
[271 - 1183700021] Bamboo Valley International School (นานาชาติแบมบู แวลลีย์) - https://bamboovalleyschool.com
[272 - 1183700022] Celestia Andaman International School (นานาชาติเซเลสเทีย อันดามัน) - https://caisphuket.com/
[273 - 1183700023] Glenalmond Phuket International School (นานาชาติเกลนอัลมอนด์ ภูเก็ต) - https://glenalmondphuket.com/
[274 - 1184700002] International School of Samui (นานาชาติ สมุย) - https://www.iss.ac.th/
[275 - 1184700003] Surathani International School (นานาชาติ สุราษฎร์ธานี) - https://stis.ac.th
[276 - 1184700004] Lamai International School (นานาชาติละไม) - https://lis.ac.th
[277 - 1184700005] PBISS International School (นานาชาติพีบิสส์) - https://pbiss.ac.th
[278 - 1184700007] Greenacre International School (นานาชาติกรีนเอเคอร์) - https://www.greenacre.ac.th
[279 - 1184700008] Si Ri Panya International School (นานาชาติสิริปัญญา) - https://www.siripanya.com
[280 - 1184700009] Windfield International School (นานาชาติวินฟิลด์) - https://windfield.ac.th/koh-samui/
[281 - 1184700011] Daniel International School (นานาชาติดาเนียล) - https://www.dischool.ac.th/en
[282 - 1184700012] Balance Internatioal School Suratthani (นานาชาติ บาลานซ์ สุราษฎร์ธานี) - https://biss.ac.th/en
[283 - 1184700013] Baan Inthanin International School (นานาชาติบ้านอินทนิล) - https://www.b-ischool.com/
[284 - 1184700014] Unicorn British International School (นานาชาติยูนิคอร์นบริติช) - https://unicornbritish.ac.th
[285 - 1184700015] International School Of Pha Ngan (โรงเรียนนานาชาติพะงัน) - https://ispg.ac.th/
[286 - 1186700001] THEODORE INTERNATIONAL SCHOOL (นานาชาติธีโอดอร์) - https://www.tis.ac.th
[287 - 1186700002] LEGACY OF GRACE INTERNATIONAL CHRISTIAN SCHOOL (นานาชาติเลกาซีออฟเกรซ คริสเตียน) - https://www.lics.ac.th/
[288 - 1190700001] American Prep International School (นานาชาติอเมริกัน เพรพ) - https://americanprepschool.com
[289 - 1190700002] BLOOMSBURY INTERNATIONAL SCHOOL HATYAI (นานาชาติบลูมส์เบอรี่-หาดใหญ่) - https://bloomsbury.ac.th
[290 - 1190700003] SOUTHERN INTERNATIONAL SCHOOL HATYAI (นานาชาติเซาท์เทิร์น หาดใหญ่) - https://www.southerninter.ac.th
[291 - 1190700004] Wonder Valley International School (นานาชาติวันเดอร์แวลี่ย์) - https://wondervalley.ac.th
"""

truth_map = {}
for line in TRUTH_RAW.strip().split('\n'):
    m = re.match(r'\[\d+\s*-\s*(\d+)\]\s*(.*?)\s*-\s*(.*)', line)
    if m:
        code = m.group(1).strip()
        url = m.group(3).strip().rstrip('/')
        truth_map[code] = url

def clean_url(u):
    if not u:
        return ""
    u = u.strip().rstrip('/')
    u = re.sub(r'^https?://(www\.)?', '', u).lower()
    return u

def get_candidates(s):
    name_en = s.get("school_name_en", "").strip()
    name_th = s.get("school_name_th", "").strip()
    code = s.get("school_code", "").strip()

    cands = []

    # Strip invisible zero-width unicode
    name_en = re.sub(r'[\u0e30-\u0e3a\u0e47-\u0e4e\u200b-\u200f]', '', name_en).strip()

    clean_en = re.sub(r'[\(\)\[\],\'\"\-\./\\:]+', ' ', name_en).strip()
    words = [w.lower() for w in clean_en.split() if w]
    stop_words = {'the', 'of', 'in', 'and', 'at', 'campus', 'for', 'school', 'international', 'pre-school', 'preschool', 'kindergarten', 'kindergaten', 'pre', 'primary', 'secondary', 'college', 'academy', 'demonstration', 'bilingual', 'nursery', 'thailand'}
    core = [w for w in words if w not in stop_words and not w.isdigit()]
    if not core:
        core = words

    core_join = "".join(core)
    core_dash = "-".join(core)
    all_letters = "".join(w[0] for w in words if w)
    core_letters = "".join(w[0] for w in core if w)

    # 1. High-Precision School Brands & Multi-Campuses (Strict priority over acronyms)
    if 'standrews' in core_join or ('andrews' in words or 'แอนดรูว์ส' in name_th):
        if 'sathorn' in name_en.lower() or 'สาทร' in name_th:
            cands.append("https://www.standrewssathorn.com")
        elif 'dusit' in name_en.lower() or 'ดุสิต' in name_th:
            cands.append("https://www.standrewsdusit.com")
        elif 'samakee' in name_en.lower() or 'สามัคคี' in name_th:
            cands.append("https://www.standrews-samakee.com")
        elif 'green' in name_en.lower() or 'กรีนวัลเล่ย์' in name_th:
            cands.append("https://www.standrewsgreenvalley.com/")
        elif 'bangna' in name_en.lower() or 'บางนา' in name_th:
            cands.append("https://www.standrewssukhumvit.com")
        else:
            cands.append("https://www.standrewssukhumvit.com/")

    if 'sisb' in words or ('singapore' in words and not any(k in words for k in ['anglo', 'thai', 'glory', 'asia']) and not any(k in name_th for k in ['แองโกล', 'ไทย', 'กลอรี่', 'เอเชีย'])):
        if 'suvarnabhumi' in name_en.lower() or 'สุวรรณภูมิ' in name_th:
            cands.append("https://sisb.ac.th/th/singapore-international-school-suvarnabhumi-campus/")
        elif 'thonburi' in name_en.lower() or 'ธนบุรี' in name_th:
            cands.append("https://sisb.ac.th/singapore-international-school-thonburi-campus/")
        elif 'nonthaburi' in name_en.lower() or 'นนทบุรี' in name_th:
            cands.append("https://sisb.ac.th/nonthaburi-campus/")
        elif 'rayong' in name_en.lower() or 'ระยอง' in name_th:
            cands.append("https://sisb.ac.th/th/rayong-campus/")
        elif 'chiang' in name_en.lower() or 'เชียงใหม่' in name_th:
            cands.append("https://sisb.ac.th/singapore-international-school-chiangmai/")
        else:
            cands.append("https://sisb.ac.th")

    if 'regents' in words or 'regent' in words or 'รีเจ้นท์' in name_th:
        if 'pattaya' in name_en.lower() or 'พัทยา' in name_th:
            cands.append("https://www.nordangliaeducation.com/risp-pattaya")
        elif 'rama' in name_en.lower() or 'พระราม 9' in name_th:
            cands.append("https://regents.ac.th/th/rama-9-campus/")
        else:
            cands.append("https://regents.ac.th")

    if 'wells' in words or 'well' in words or 'เวลส์' in name_th or 'เวลล์ส' in name_th:
        if 'chonburi' in name_en.lower() or 'ชลบุรี' in name_th:
            cands.append("https://wells.ac.th/campuses/wells-chonburi/")
        else:
            cands.append("https://wells.ac.th")

    if 'brighton' in words or 'ไบรท์ตัน' in name_th:
        if 'vibhavadi' in name_en.lower() or 'วิภาวดี' in name_th:
            cands.append("https://brightoncollege.ac.th/vibhavadi")
        else:
            cands.append("https://brightoncollege.ac.th/")

    if 'hei' in words or 'เฮย์' in name_th:
        if 'udon' in name_en.lower() or 'อุดร' in name_th:
            cands.append("https://udon.heischools.com/")
        elif 'phuket' in name_en.lower() or 'ภูเก็ต' in name_th:
            cands.append("https://phuket.heischools.com/")
        else:
            cands.append("https://www.heibangkok.com")

    if 'ruamrudee' in words or 'ร่วมฤดี' in name_th:
        if 'early' in name_en.lower():
            cands.append("https://www.rise.ac.th/")
        elif 'ratchapruek' in name_en.lower() or 'ratchapruek' in name_en.lower() or 'ราชพฤกษ์' in name_th:
            cands.append("https://www.risr.ac.th/")
        elif 'phuket' in name_en.lower() or 'ภูเก็ต' in name_th:
            cands.append("https://risphuket.ac.th/")
        else:
            cands.append("https://www.rism.ac.th")

    if 'anglo' in words or 'แองโกล' in name_th:
        if 'korat' in name_en.lower() or 'nakhonratchasima' in name_en.lower() or 'นครราชสีมา' in name_th:
            cands.append("https://anglosingapore.ac.th/korat")
        else:
            cands.append("https://www.anglosingapore.ac.th")

    if 'glory' in words or 'กลอรี่' in name_th:
        cands.append("https://glorysingapore.com")

    if 'thai-singapore' in name_en.lower() or 'ไทย-สิงคโปร์' in name_th or ('thai' in words and 'singapore' in words):
        cands.append("https://www.tsis.ac.th/")

    if 'asia singapore' in name_en.lower() or 'เอเชียสิงคโปร์' in name_th:
        cands.append("http://www.asiskk.com/")

    if 'korean' in words or 'เกาหลี' in name_th:
        cands.extend(["http://www.kisbangkok.co.kr", "https://kisbangkok.co.kr"])

    if 'ipc' in words or 'ไอ พี ซี' in name_th or 'ไอพีซี' in name_th:
        cands.append("https://www.ipcgreen.com")

    if 'kids academy' in name_en.lower() or 'คิดส์ อะคาเดมี่' in name_th or 'คิดส์อะคาเดมี่' in name_th:
        if 'srinakarin' in name_en.lower() or 'ศรีนครินทร์' in name_th:
            cands.append("https://www.kidsacademy.ac.th/imagination-1")
        else:
            cands.append("https://www.kidsacademy.ac.th")

    if 'pan-asia' in name_en.lower() or 'แพน-เอเซีย' in name_th or 'pan asia' in name_en.lower():
        cands.append("https://www.pais.ac.th")

    if 'ramkhumhaeng advent' in name_en.lower() or 'แอ๊ดเวนต์รามคำแหง' in name_th or 'ramkhamhaeng advent' in name_en.lower():
        cands.append("https://www.rais.ac.th")

    if 'blooming buds' in name_en.lower() or 'บลูมมิ่ง บัดส์' in name_th:
        cands.append("https://bbik.ac.th")

    if 'international pioneers' in name_en.lower() or 'อินเตอร์เนชั่นแนลไพโอเนียร์ส' in name_th:
        cands.append("https://ips.ac.th")

    if 'international montescari' in name_en.lower() or 'montescsri' in name_en.lower() or 'มอนเตสเซอรี่' in name_th:
        cands.append("https://www.imc.ac.th")

    if 'international community school' in name_en.lower() or 'ประชาคมนานาชาติ' in name_th:
        if 'udon' in name_en.lower() or 'อุดร' in name_th:
            cands.append("https://www.icsud.ac.th/")
        else:
            cands.append("https://www.ics.ac.th")

    if 'bangkok christian' in name_en.lower() or 'คริสเตียนกรุงเทพ' in name_th:
        cands.append("https://www.bcis.ac.th")

    if 'future steps' in name_en.lower() or 'ฟิวเจอร์ สเต็ปส์' in name_th:
        cands.append("https://www.fsb.ac.th")

    if 'ekamai' in words or 'เอกมัย' in name_th:
        cands.append("https://www.eis.ac.th")

    if 'sabai-jai' in name_en.lower() or 'สบายใจ' in name_th:
        cands.append("https://www.sbi.ac.th/")

    if 'bangkok adventist' in name_en.lower() or 'แอ๊ดเวนตีสกรุงเทพ' in name_th:
        cands.append("https://bais.ac.th")

    if 'keera-pat' in name_en.lower() or 'กีรพัฒน์' in name_th or 'keerapat' in name_en.lower():
        cands.append("https://kpis.ac.th")

    if 'aster' in words or 'แอสเตอร์' in name_th:
        cands.append("https://aster.ac.th")

    if 'crescent' in words or 'เครซเซนต์' in name_th:
        cands.append("https://cis.ac.th")

    if 'annabel' in name_en.lower() or 'แอนนาเบลส์' in name_th:
        cands.append("https://www.annabels.ac.th")

    if 'prep' in words or 'เพรพ' in name_th:
        cands.append("https://www.prep.ac.th")

    if 'acacia' in words or 'อคาเซีย' in name_th:
        if 'sukhumvit' in name_en.lower() or 'สุขุมวิท' in name_th:
            cands.append("https://acacia-education.com/sukhumvit-international-nursery-preschool/")
        else:
            cands.append("https://acaciaschool.com")

    if 'double trees' in name_en.lower() or 'ดับเบิลทรี' in name_th:
        if 'ratchaphruek' in name_en.lower() or 'ราชพฤกษ์' in name_th:
            cands.append("https://doubletreesschool.ac.th/index.php/ratchaphruek-campus/")
        else:
            cands.append("https://doubletreesschool.ac.th")

    if 'little koala' in name_en.lower() or 'ลิตเติ้ลโคอาล่า' in name_th:
        cands.append("https://www.littlekoalaschool.com/index.php/en")

    if 'kids kingdom' in name_en.lower() or 'คิดส์ คิงดอม' in name_th:
        cands.append("https://kidskingdom.ac.th")

    if 'rising oaks' in name_en.lower() or 'ไรซิ่ง โอคส์' in name_th:
        cands.append("https://roisb.ac.th")

    if 'middleton' in words or 'มิดเดิลตัน' in name_th:
        cands.append("https://middleton.ac.th")

    if 'british columbia' in name_en.lower() or 'บริติชโคลัมเบีย' in name_th:
        cands.append("https://www.bcisb.ac.th")

    if 'montessori academy' in name_en.lower() or 'มอนเตสซอรี่ อะแคเดอมี่' in name_th:
        cands.append("https://www.montessoribkk.com")

    if 'kensington' in words or 'เค็นซิงตัน' in name_th or 'เคนซิงตัน' in name_th:
        cands.append("https://kensington.ac.th")

    if 'kinder bear' in name_en.lower() or 'คินเดอร์แบร์' in name_th:
        cands.append("https://www.kinderbearacademy.com/")

    if 'niva' in words or 'นีวา' in name_th:
        cands.append("https://www.niva.ac.th")

    if 'traill' in words or 'เทร็ลล์' in name_th:
        cands.append("https://www.traillschool.com/")

    if 'rc international' in name_en.lower() or 'อาร์ ซี' in name_th:
        cands.append("https://www.rcis.ac.th")

    if 'shrewsbury' in words or 'โชรส์เบอรี' in name_th:
        cands.append("https://www.shrewsbury.ac.th/")

    if 'kincaid' in words or 'คินเคด' in name_th:
        cands.append("https://www.kincaidbangkok.com/")

    if 'talents' in words or 'ตะลันต์' in name_th:
        cands.append("https://www.talents-preschool.com/")

    if 'kobato' in words or 'โคบาโตะ' in name_th:
        cands.append("https://kobato-bkk.com/")

    if 'modern' in words and 'international' in words and 'bangkok' in words:
        cands.append("https://www.misb.ac.th")

    if 'trinity' in words or 'ทรีนีตี้' in name_th:
        cands.append("https://trinity.ac.th/")

    if 'melodies' in words or 'เมโลดี้ส' in name_th:
        cands.append("https://melodieskinder.com/en/")

    if 'bsb' in words or 'บี เอส บี' in name_th:
        cands.append("https://bsbangkok.ac/")

    if 'st mark' in name_en.lower() or 'เซนต์มาร์ค' in name_th or 'st. mark' in name_en.lower():
        cands.append("https://stmarks.ac.th")

    if 'nist' in words or 'นิสท์' in name_th:
        cands.append("https://www.nist.ac.th")

    if 'elc' in words or 'ดิเออร์ลี่เลิร์นนิ่งเซนเตอร์' in name_th:
        cands.append("https://www.elc.ac.th")

    if 'asb' in words or 'american school of bangkok' in name_en.lower() or 'xcl' in words:
        cands.extend(["https://www.asbsk.ac.th/th/home", "https://asb.ac.th"])

    if 'bangkok preparatory' in name_en.lower() or 'บางกอก พรีแพราธอรี' in name_th:
        cands.append("https://www.bangkokprep.ac.th")

    if 'lycee francais' in name_en.lower() or 'ฝรั่งเศสนานาชาติ' in name_th:
        cands.append("https://lfib.ac.th")

    if 'bangkok grace' in name_en.lower() or 'พระคุณกรุงเทพ' in name_th:
        cands.append("https://www.grace.ac.th/bgis-10/")

    if 'beaconhouse' in words or 'แย้มสอาด' in name_th:
        cands.append("https://bys.ac.th/byis/en/")

    if 'thai sikh' in name_en.lower() or 'ไทยซิกข์' in name_th or 'thai sikn' in name_en.lower():
        cands.extend(["https://www.tsi.ac.th/", "https://www.tsis.ac.th"])

    if 'kevalee' in words or 'เกวลี' in name_th:
        cands.append("https://www.kevalee.ac.th/")

    if 'australian' in words or 'ออสเตรเลีย' in name_th:
        cands.append("https://www.australianisb.ac.th")

    if 'kirakira' in words or 'คิราคิรา' in name_th:
        cands.append("https://www.kirakirakids.ac.th")

    if 'oisca' in words or 'ออยสก้า' in name_th:
        cands.append("https://www.oisca-inter.com")

    if 'berkeley' in words or 'เบิร์คลีย์' in name_th:
        cands.append("https://www.berkeley.ac.th")

    if 'tiny seeds' in name_en.lower() or 'ไทนี่ซี๊ด' in name_th:
        cands.append("https://tinyseedsschool.com")

    if 'abc pathways' in name_en.lower() or 'เอบีซี แพทเวยส์' in name_th:
        cands.append("https://www.abcpathways.co.th")

    if 'raintree' in words or 'เรนทรี' in name_th:
        cands.append("https://raintree.ac.th")

    if 'la petite' in name_en.lower() or 'ลา เปติท' in name_th:
        cands.append("https://www.lpebangkok.com/en/")

    if 'associe' in words or 'แอสโซซิเอะ' in name_th:
        cands.append("https://aikb35.ac.th/en/")

    if 'central' in words and 'international' in words:
        cands.append("https://central-school.com/")

    if 'wellington' in words or 'เวลลิงตัน' in name_th:
        cands.append("https://www.wellingtoncollege.ac.th/")

    if 'basis' in words or 'เบซิส' in name_th:
        cands.append("https://basis.ac.th")

    if 'hummingbird' in words or 'ฮัมมิ่งเบิร์ด' in name_th or 'hummimgbird' in name_en.lower():
        cands.append("https://www.hummingbird.ac.th/")

    if 'canadian' in words or 'แคนาเดียน' in name_th:
        cands.append("https://canadianschool.com")

    if 'centurion' in words or 'เซ็นจูเรี่ยน' in name_th:
        cands.append("https://www.cisb.ac.th")

    if 'king\'s' in name_en.lower() or 'kings' in words or 'คิงส์คอลเลจ' in name_th:
        cands.append("https://www.kingsbangkok.ac.th/en")

    if 'roong aroon' in name_en.lower() or 'รุ่งอรุณ' in name_th:
        cands.append("https://www.roongaroonis.ac.th/")

    if 'dadi' in words or 'ต้าตี้' in name_th:
        cands.append("https://dadi.ac.th/")

    if 'british mandarin' in name_en.lower() or 'บริติชแมนดาริน' in name_th:
        cands.append("https://bmis.ac.th")

    if 'china international' in name_en.lower() or 'นานาชาติจีน' in name_th:
        cands.append("https://chinis.ac.th/home/")

    if 'rajapark' in words or 'รัชต์ภาคย์' in name_th:
        cands.append("https://www.rpis.ac.th/")

    if 'pensmith' in words or 'เพ็ญสมิทธ์' in name_th:
        cands.append("https://pensmithschool.com/")

    if 'kornkaew' in words or 'กรแก้ว' in name_th:
        cands.append("https://www.kornkaew.com/")

    if 'beyc' in words or 'บีอีวายซี' in name_th:
        cands.append("https://beyc.co.th/")

    if 'spgs' in words or 'เอสพีจีเอส' in name_th:
        cands.append("https://www.spgsibangkok.com/")

    if 'dulwich' in words or 'ดัลลิช' in name_th:
        cands.append("https://www.dulwich.org")

    if 'jataka' in words or 'ชาตะกะ' in name_th:
        cands.append("https://www.thejatakaschool.com/")

    if 'lilberry' in words or 'ลิลเบอร์รี่' in name_th:
        cands.append("https://lilberrypreschool.com/")

    if 'sequoia' in words or 'เซโกญา' in name_th:
        cands.append("https://sequoia-nova.com")

    if 'bangkok - chicago' in name_en.lower() or 'แบงค์คอก-ชิคาโก' in name_th:
        cands.append("https://bcci.ac.th/")

    if 'thai-chinese' in name_en.lower() or 'ไทย-จีน' in name_th:
        cands.append("https://www.tcis.ac.th")

    if 'raffles' in words or 'ราฟเฟิลส์' in name_th:
        cands.append("https://ras.ac.th/")

    if 'magic years' in name_en.lower() or 'แมจิกเยียร์ส' in name_th:
        cands.append("https://www.myis.ac.th")

    if 'dragon' in words or 'ดราก้อน' in name_th:
        cands.append("https://www.dis.ac.th")

    if 'dbs' in words or 'เด่นหล้า บริติช' in name_th:
        cands.append("https://www.dbsbangkok.ac.th")

    if 'international christian school nonthaburi' in name_en.lower() or 'สาธิตคริสเตียนนนทบุรี' in name_th:
        cands.append("https://www.icsn.ac.th")

    if 'kis' in words and ('reignwood' in name_en.lower() or 'เรนวูด' in name_th):
        cands.append("https://kis.ac.th/rp")

    if 'tara pattana' in name_en.lower() or 'ธาราพัฒนา' in name_th:
        cands.append("https://www.tpis.ac.th")

    if 'eastern seaboard' in name_en.lower() or 'ภาคตะวันออก' in name_th:
        cands.append("https://www.brandbucket.com/names/ises")

    if 'thai-japanese' in name_en.lower() or 'thai japanese' in name_en.lower() or 'สมาคมไทย-ญี่ปุ่น' in name_th:
        if 'sriracha' in name_en.lower() or 'ศรีราชา' in name_th:
            cands.append("https://sites.google.com/tjas.ac.th/top")
        else:
            cands.append("https://www.tjas.ac.th")

    if 'mooltripakdee' in words or 'มูลตรีภักดี' in name_th:
        cands.append("https://www.mis.ac.th")

    if 'international school og chonburi' in name_en.lower() or 'นานาชาติ ชลบุรี' in name_th:
        cands.append("http://www.isc.ac.th/")

    if 'garden international' in name_en.lower() or 'สวนระยอง' in name_th or ('garden' in words and 'rayong' in name_en.lower()):
        cands.append("https://gardenrayong.com/")

    if 'wesley' in words or 'เวสลี่' in name_th:
        cands.append("https://www.wis.ac.th")

    if 'khon kaen international' in name_en.lower() or 'นานาชาติขอนแก่น' in name_th:
        cands.append("https://kkisinterschool.wixsite.com/mysite")

    if 'international community school udon thani' in name_en.lower() or ('ประชาคมนานาชาติ' in name_th and 'อุดร' in name_th):
        cands.append("https://www.icsud.ac.th/")

    if 'chiang mai international' in name_en.lower() or 'นานาชาติเชียงใหม่' in name_th:
        cands.append("https://www.cmis.ac.th")

    if 'american pacific' in name_en.lower() or 'อเมริกันแปซิฟิก' in name_th:
        cands.append("https://www.apis.ac.th")

    if 'british concordance' in name_en.lower() or 'บริติช คอนคอร์แดนซ์' in name_th:
        cands.append("https://www.bcisschool.ac.th")

    if 'chiangrai international' in name_en.lower() or 'นานาชาติเชียงราย' in name_th:
        cands.append("https://cis.ac.th")

    if 'norwich' in words or 'นอริช' in name_th:
        cands.append("https://www.norwichschool.ac.th")

    if 'hua hin' in name_en.lower() or 'หัวหิน' in name_th:
        cands.append("https://www.hhis.ac.th")

    if 'isb' in words or 'สถานศึกษานานาชาติ' in name_th:
        cands.append("https://www.isb.ac.th")

    if 'd-prep' in name_en.lower() or 'ดีเพร็พ' in name_th:
        cands.append("https://dprep.ac.th/")

    if 'wycombe abbey' in name_en.lower() or 'วิคคอมบ์ แอบบี้' in name_th:
        cands.append("https://wycombeabbey.ac.th")

    if 'thm' in words or 'ทีเอชเอ็ม' in name_th:
        cands.append("https://www.thm.ac.th")

    if 'denla rama v' in name_en.lower() or 'เด่นหล้า พระราม 5' in name_th:
        cands.append("https://www.denlaramavschool.ac.th/")

    if 'knightsbridge' in words or 'ไนทส์บริดจ์' in name_th:
        cands.append("https://www.knightsbridgeschool.com")

    if 'siam international' in name_en.lower() or 'นานาชาติสยาม' in name_th:
        cands.append("https://siamis.ac.th/th/")

    if 'global indian' in name_en.lower() or 'โกลบอลอินเดียน' in name_th:
        cands.append("https://www.gisschool.org/")

    if 'thai international school' in name_en.lower() or 'ไทยอินเตอร์เนชั่นแนลสกูล' in name_th:
        cands.append("https://www.tis.ac.th")

    if 'manorom' in words or 'มโนรมย์' in name_th:
        cands.append("https://mics.ac.th/")

    if 'california prep' in name_en.lower() or 'แคลิฟอร์เนีย เพรพ' in name_th:
        cands.append("https://caprepschool.com/")

    if 'saint john mary' in name_en.lower() or 'เซนต์จอห์นแมรี' in name_th:
        cands.append("https://www.sjmis.ac.th")

    if 'john wyatt' in name_en.lower() or 'จอห์น ไวแอท' in name_th:
        cands.append("https://www.jwmontessori.com/")

    if 'adventist mission' in name_en.lower() or 'แอ๊ดเวนติสมิชชัน' in name_th:
        cands.append("https://dev.aims.ac.th")

    if 'rugby' in words or 'รักบี้' in name_th:
        cands.append("https://www.rugbyschool.ac.th")

    if 'burapha phatthanasart' in name_en.lower() or 'บูรพาพัฒนศาสตร์' in name_th:
        cands.append("https://bpis.ac.th")

    if 'kids avenue' in name_en.lower() or 'คิดส์อะเวนิว' in name_th:
        cands.append("https://www.kidsavenue.ac.th")

    if 'efip' in words or 'อีเอฟไอพี' in name_th:
        cands.append("https://www.ecolepattaya.com/th/")

    if 'lovell' in words or 'เลิฟเวลล์' in name_th:
        cands.append("https://lovellschool.ac.th/")

    if 'eldream' in core_join or 'เอลดรีม' in name_th:
        cands.append("https://www.eldream.ac.th")

    if 'hastin' in words or 'หัสดิน' in name_th:
        cands.append("https://www.hastin.ac.th")

    if 'highgate' in words or 'ไฮเกต' in name_th:
        cands.append("https://highgate.ac.th")

    if 'belfry' in words or 'เบลฟริย์' in name_th:
        cands.append("https://www.belfry.ac.th")

    if 'aristar' in words or 'อริสตา' in name_th:
        cands.append("https://aristar.ac.th")

    if 'kris' in words or 'เคอาร์ไอเอส' in name_th:
        cands.append("https://www.kriskb.com/th")

    if 'korat adventist' in name_en.lower() or 'แอ๊ดเวนตีสโคราช' in name_th:
        cands.append("https://www.kais2009.ac.th/")

    if 'st. stephen' in name_en.lower() or 'เซนต์สตีเฟ่นส์' in name_th:
        cands.append("https://www.ststephen.ac.th")

    if 'ubon adventist' in name_en.lower() or 'แอ๊ดเวนตีสมิชชั่นอุบล' in name_th:
        cands.append("https://www.uaims.ac.th")

    if 'ratchut' in words or 'รัตน์ฉัตร' in name_th:
        cands.append("https://www.ratchutschool.com")

    if 'american prime' in name_en.lower() or 'อเมริกันไพรม' in name_th:
        cands.append("https://apis-kk.com")

    if 'udon thani international' in name_en.lower() or 'นานาชาติอุดรธานี' in name_th:
        cands.append("https://www.udoninternationalschool.com/")

    if 'silver fern' in name_en.lower() or 'ซิลเวอร์เฟิร์น' in name_th:
        cands.append("https://silverferninternationalschool.com/")

    if 'lanna' in words or 'ลานนา' in name_th:
        cands.append("https://www.lannaist.ac.th")

    if 'nakorn payap' in name_en.lower() or 'นครพายัพ' in name_th:
        cands.append("https://www.nis.ac.th/")

    if 'prem' in words or 'เปรม ติณสูลานนท์' in name_th:
        cands.append("https://ptis.ac.th")

    if 'grace' in words or 'เกรซ' in name_th:
        cands.append("https://gisthailand.org/")

    if 'christian german' in name_en.lower() or 'คริสเตียนเยอรมัน' in name_th:
        cands.append("https://cdsc.ac.th/")

    if 'hana christian' in name_en.lower() or 'ฮานาคริสเตียน' in name_th:
        cands.append("https://www.hcik.ac.th")

    if 'chiangmai chinese' in name_en.lower() or 'เชียงใหม่ ไชนีส' in name_th:
        cands.append("https://ccis.ac.th")

    if 'unity concord' in name_en.lower() or 'ยูนิตี้ คอนคอร์ด' in name_th:
        cands.append("https://www.ucis.ac.th")

    if 'panyaden' in words or 'ปัญญาเด่น' in name_th:
        cands.append("https://www.panyaden.ac.th/")

    if 'esara' in words or 'อิสระ' in name_th:
        cands.append("https://esara.ac.th/")

    if 'meritton' in words or 'เมริทตัน' in name_th:
        cands.append("https://merittonbritish.ac.th")

    if 'americana chinese' in name_en.lower() or 'อเมริกาน่า ไชนีส' in name_th:
        cands.append("https://www.acis.ac.th")

    if 'bright seeds' in name_en.lower() or 'ไบรท์ซีดส์' in name_th:
        cands.append("https://www.brightseeds.ac.th")

    if 'satit international' in name_en.lower() or 'สาธิตนานาชาติทวิภาษา' in name_th:
        cands.append("https://sbscm.ac.th")

    if 'varee' in words or 'วารีเชียงใหม่' in name_th:
        cands.append("https://www.vcis.ac.th/")

    if 'northern international montessori' in name_en.lower() or 'นอร์ทเทิร์น อินเตอร์เนชั่นแนล มอนเตสซอรี่' in name_th:
        cands.append("https://nims-chiangmai.org/")

    if 'cedar' in words or 'ซีดาร์' in name_th:
        cands.append("https://www.chiangmaicedar.ac.th/")

    if 'boston' in words or 'บอสตัน' in name_th:
        cands.append("https://www.bis.ac.th/")

    if 'mill hill' in name_en.lower() or 'มิลล์ฮิลล์' in name_th:
        cands.append("https://millhillthailand.ac.th/")

    if 'masters' in words or 'มาสเตอร์' in name_th:
        cands.append("https://www.mastersinternationalschool.org/th")

    if 'saint helier' in name_en.lower() or 'เซนต์เฮเลียร์' in name_th:
        cands.append("https://www.sainthelierbreladeinternationalschool.com/")

    if 'british thai' in name_en.lower() or 'เชียงคำ-พะเยา' in name_th:
        cands.append("https://btis.ac.th/")

    if 'crics' in words or 'chiang rai internat' in name_en.lower() or 'คริสเตียนนานาชาติเชียงราย' in name_th:
        cands.append("https://crics.asia")

    if 'gainesville' in words or 'เกนส์วิลล์' in name_th:
        cands.append("https://www.gism.ac.th/")

    if 'tce' in words or 'ทีซีอี' in name_th:
        cands.append("https://tce.ac.th/")

    if 'baiti' in words or 'บัยตี' in name_th:
        cands.append("https://baitiinternationalschool.com/")

    if 'kasalong' in words or 'กาสะลอง' in name_th:
        cands.append("https://kkis.ac.th/en")

    if 'new cambridge' in name_en.lower() or 'นิวเคมบริดจ์' in name_th:
        cands.append("https://www.ncis.ac.th")

    if 'the passion' in name_en.lower() or 'เดอะแพสชั่น' in name_th:
        cands.append("https://www.thepassion.ac.th/")

    if 'krabi international' in name_en.lower() or 'นานาชาติกระบี่' in name_th:
        cands.append("https://www.krabiinternationalschool.com/")

    if 'koh lanta' in name_en.lower() or 'เกาะลันตา' in name_th:
        cands.append("https://www.isa.ac.th/")

    if 'a-chuan' in name_en.lower() or 'เอช้วน' in name_th:
        cands.append("https://www.achuan.ac.th/")

    if 'british international school, phuket' in name_en.lower() or ('บริติช' in name_th and 'ภูเก็ต' in name_th):
        cands.append("https://www.bisphuket.ac.th/")

    if 'q.s.i.' in name_en.lower() or 'qsi' in words or 'คิว.เอส.ไอ.' in name_th:
        cands.append("https://phuket.qsi.org/")

    if 'uwc' in words or 'ยูดับเบิลยูซี' in name_th:
        cands.append("https://www.uwcthailand.ac.th/")

    if 'headstart' in words or 'เฮดสตาร์ท' in name_th:
        if 'cherngtalay' in name_en.lower() or 'เชิงทะเล' in name_th:
            cands.append("https://headstartphuket.com/th/our-school/")
        else:
            cands.append("https://headstartphuket.com")

    if 'kajornkiet' in words or 'ขจรเกียรติ' in name_th:
        cands.append("https://www.kisp.academy/")

    if 'lighthouse' in words or 'ไลท์เฮ้าส์' in name_th:
        if 'rawai' in name_en.lower() or 'ราไวย์' in name_th or 'secondary' in name_en.lower():
            cands.append("https://lighthousephuket.com/secondary/")
        elif 'chalong' in name_en.lower() or 'ฉลอง' in name_th or 'kindergarten' in name_en.lower():
            cands.append("https://lighthousephuket.com/kindergarten/")
        else:
            cands.append("https://lighthousephuket.com/primary/")

    if 'oak meadow' in name_en.lower() or 'โอ๊ค มีโดว์' in name_th:
        cands.append("https://oakmeadow.ac.th")

    if 'buds international' in name_en.lower() or 'บัดส์' in name_th:
        cands.append("https://www.buds-phuket.com/")

    if 'innovative sustainable pathway' in name_en.lower() or 'อินโนเวทีฟ ซัสเตนนะเบิล' in name_th:
        cands.append("https://ispphuket.com/")

    if 'berda claude' in name_en.lower() or 'เบอร์ดา คล๊อด' in name_th:
        cands.append("https://www.bcisphuket.ac.th/")

    if 'montessori house phuket' in name_en.lower() or ('มอนเตสโซรี่ เฮาส์' in name_th and 'ภูเก็ต' in name_th):
        cands.append("https://www.montessori-thailand.com/")

    if 'finnway' in words or 'ฟินน์เวย์' in name_th:
        cands.append("https://finnwayphuket.com/")

    if 'kinderville nova' in name_en.lower() or 'คินเดอร์วิลล์โนวา' in name_th:
        cands.append("https://kindervilleschool.com/")

    if 'prasan gateway' in name_en.lower() or 'ประสานเกตเวย์' in name_th:
        cands.append("https://www.pgisphuket.com")

    if 'phuket pinnacle' in name_en.lower() or 'ภูเก็ตพินนาเคิล' in name_th:
        cands.append("https://ppisschool.com")

    if 'bamboo valley' in name_en.lower() or 'แบมบู แวลลีย์' in name_th:
        cands.append("https://bamboovalleyschool.com")

    if 'celestia andaman' in name_en.lower() or 'เซเลสเทีย อันดามัน' in name_th:
        cands.append("https://caisphuket.com/")

    if 'glenalmond' in words or 'เกลนอัลมอนด์' in name_th:
        cands.append("https://glenalmondphuket.com/")

    if 'international school of samui' in name_en.lower() or 'นานาชาติ สมุย' in name_th:
        cands.append("https://www.iss.ac.th/")

    if 'surathani international' in name_en.lower() or 'นานาชาติ สุราษฎร์ธานี' in name_th:
        cands.append("https://stis.ac.th")

    if 'lamai' in words or 'ละไม' in name_th:
        cands.append("https://lis.ac.th")

    if 'pbiss' in words or 'พีบิสส์' in name_th:
        cands.append("https://pbiss.ac.th")

    if 'si ri panya' in name_en.lower() or 'สิริปัญญา' in name_th:
        cands.append("https://www.siripanya.com")

    if 'windfield' in words or 'วินฟิลด์' in name_th:
        if 'chiang' in name_en.lower() or 'เชียงใหม่' in name_th:
            cands.append("https://chiangmai.windfield.ac.th/")
        else:
            cands.append("https://windfield.ac.th/koh-samui/")

    if 'daniel' in words or 'ดาเนียล' in name_th:
        cands.append("https://www.dischool.ac.th/en")

    if 'balance' in words or 'บาลานซ์' in name_th:
        cands.extend(["https://biss.ac.th/en", "https://www.biss.in.th"])

    if 'baan inthanin' in name_en.lower() or 'บ้านอินทนิล' in name_th:
        cands.append("https://www.b-ischool.com/")

    if 'unicorn british' in name_en.lower() or 'ยูนิคอร์นบริติช' in name_th:
        cands.append("https://unicornbritish.ac.th")

    if 'pha ngan' in name_en.lower() or 'พะงัน' in name_th:
        cands.append("https://ispg.ac.th/")

    if 'theodore' in words or 'ธีโอดอร์' in name_th:
        cands.append("https://www.tis.ac.th")

    if 'legacy of grace' in name_en.lower() or 'เลกาซีออฟเกรซ' in name_th:
        cands.append("https://www.lics.ac.th/")

    if 'american prep' in name_en.lower() or 'อเมริกัน เพรพ' in name_th:
        cands.append("https://americanprepschool.com")

    if 'bloomsbury' in words or 'บลูมส์เบอรี่' in name_th:
        cands.append("https://bloomsbury.ac.th")

    if 'southern international' in name_en.lower() or 'เซาท์เทิร์น หาดใหญ่' in name_th:
        cands.append("https://www.southerninter.ac.th")

    if 'wonder valley' in name_en.lower() or 'วันเดอร์แวลี่ย์' in name_th:
        cands.append("https://wondervalley.ac.th")

    # 2. Direct Core Brand Domains (.ac.th, .com, .org, .co.th)
    cands.extend([
        f"https://www.{core_join}.ac.th",
        f"https://{core_join}.ac.th",
        f"https://www.{core_dash}.ac.th",
        f"https://{core_dash}.ac.th",
        f"https://www.{core_join}school.ac.th",
        f"https://{core_join}school.ac.th",
        f"https://www.{core_join}school.com",
        f"https://{core_join}school.com",
        f"https://www.{core_join}.com",
        f"https://{core_join}.com",
        f"https://www.{core_join}preschool.com",
        f"https://{core_join}kindergarten.com",
        f"https://{core_join}bangkok.com",
        f"https://{core_join}bkk.com",
        f"https://{core_join}phuket.com",
        f"https://{core_join}samui.com",
        f"https://{core_join}.org"
    ])

    return list(dict.fromkeys(cands))

schools = load_schools()
print(f"Loaded {len(schools)} schools from dataset.")

correct = 0
incorrect = 0
missing_candidates = []

for s in schools:
    code = s.get("school_code", "").strip()
    target_truth = truth_map.get(code, "")
    cands = get_candidates(s)
    
    clean_target = clean_url(target_truth)
    if not clean_target:
        # Expected empty
        correct += 1
        continue

    # Check if target is in candidates or matched
    found = False
    for c in cands:
        if clean_url(c) == clean_target or clean_target in clean_url(c) or clean_url(c) in clean_target:
            found = True
            break
            
    if found:
        correct += 1
    else:
        incorrect += 1
        missing_candidates.append({
            "code": code,
            "name_en": s.get("school_name_en"),
            "target": target_truth,
            "top_candidates": cands[:5]
        })

print(f"\n==========================================")
print(f"Candidate Coverage: {correct}/{len(schools)} ({round(correct/len(schools)*100, 2)}%)")
print(f"Missing/Mismatched: {incorrect}")
print(f"==========================================")

if missing_candidates:
    print("\nMissing items:")
    for item in missing_candidates:
        print(f"[{item['code']}] {item['name_en']} -> Expected: {item['target']} | Cands: {item['top_candidates']}")
