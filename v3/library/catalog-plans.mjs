// Editorial decisions for 45 selected V1 recipes. Numeric tokens bind rows;
// shared ingredients use explicit fractions, never number replacement in prose.
const s=(row,share)=>({row,share});
export const plans={
  4:{category:'viande',sides:[1,2,3],steps:[
    ['Préchauffer le four à 210 °C. Éplucher et couper ',3,' en bâtonnets. Mélanger avec ',s(15,'1/2'),', ',14,' et une partie de ',16,' et ',17,'. Cuire 25 à 30 minutes.'],
    ['Couper ',1,' et ',2,' ; cuire dans l’eau salée 20 minutes. Hacher ',4,' et ',5,'.'],
    ['Mélanger ',0,', ',6,', ',7,', la moitié de l’oignon, l’ail et ',13,'. Former de petites boulettes régulières.'],
    ['Dorer les boulettes dans ',s(15,'1/2'),' pendant 6 à 8 minutes. Ajouter le reste de l’oignon, cuire 2 minutes. Verser ',10,' et ',8,'. Mijoter à couvert 6 à 8 minutes, jusqu’à cuisson à cœur.'],
    ['Égoutter les légumes de la purée et écraser avec ',12,' et ',11,'. Répartir le reste du sel et du poivre entre la purée et la sauce.'],
    ['Tempérer ',9,' avec un peu de sauce chaude, puis incorporer hors du feu sans faire bouillir. Servir les boulettes avec la purée, les carottes et la sauce.']]},
  5:{category:'poisson',sides:[2],adjust:{8:['1/4','Basilic en garniture et vinaigrette pour deux bols : un quart de botte proposé, plutôt qu’une botte entière.'],9:['1/4','Menthe aromatique pour deux bols : un quart de botte proposé.']},steps:[
    ['Rincer et cuire ',2,' avec 1,5 fois son volume d’eau bouillante salée, 10 minutes à couvert ; égoutter si nécessaire et aérer.'],
    ['Rincer et égoutter ',1,' et ',0,'. Couper ',3,', ',4,' et ',5,'.'],
    ['Mélanger jus et zeste de ',6,', ',7,' râpé, ',10,', ',8,', ',9,' et ',11,'.'],
    ['Mélanger le boulgour tiédi avec les deux tiers de la vinaigrette. Ajouter les légumes et les edamame. Répartir dans les bols, ajouter les crevettes puis le reste de vinaigrette.']]},
  6:{category:'poisson',sides:[0],steps:[
    ['Cuire ',0,' selon le paquet et laisser refroidir. Blanchir ou décongeler ',4,' selon le produit.'],
    ['Couper ',2,' et ',3,' en dés. Répartir le quinoa dans les bols.'],
    ['Ajouter ',1,', les fruits et les edamame. Arroser du jus de ',6,' et parsemer de ',5,' ciselée.']]},
  7:{category:'vegetarien',adjust:{13:['1/2','Persil de finition de cinq bols : une demi-botte au total proposée, contre 2,5 bottes en V1.']},steps:[
    ['Rincer, égoutter et sécher ',0,'. Mélanger avec ',1,', ',2,', ',3,', ',4,' et une partie de ',14,'.'],
    ['Cuire à l’Air Fryer à 200 °C pendant 12 à 15 minutes en secouant à mi-cuisson ; adapter les fournées.'],
    ['Couper ',6,', ',7,' et ',8,'. Émietter ',5,'.'],
    ['Mélanger ',10,', le jus de ',11,' et ',12,' râpé pour la sauce. Utiliser le reste de l’assaisonnement.'],
    ['Répartir ',9,' puis les légumes, la feta et les pois chiches dans les bols. Ajouter la sauce et ',13,' ciselé.']]},
  8:{category:'viande',sides:[1],steps:[
    ['Couper ',1,' en morceaux de 2 cm. Sécher puis mélanger avec ',s(13,'1/2'),', ',s(9,'1/2'),', ',s(12,'1/2'),' et une partie de ',15,'.'],
    ['Préchauffer l’Air Fryer à 200 °C pendant 3 minutes. Cuire les pommes de terre 18 à 22 minutes en secouant après 8 à 10 minutes. Vérifier la cuisson.'],
    ['Couper ',0,' en lamelles. Mariner avec ',s(13,'1/2'),', ',s(9,'1/2'),', ',10,', ',11,', ',s(12,'1/2'),', ',s(8,'1/2'),' et le jus de ',s(6,'1/2'),'. Cuire à la poêle 7 à 9 minutes, à cœur.'],
    ['Mélanger ',7,', ',s(8,'1/2'),', le jus de ',s(6,'1/2'),' et ',14,'. Détendre avec un peu d’eau si nécessaire.'],
    ['Couper ',2,', ',3,' et ',4,'. Laver ',5,'. Répartir avec le poulet et les pommes de terre. Ajouter la sauce et le reste de l’assaisonnement.']]},
  9:{category:'poisson',sides:[0],steps:[
    ['Cuire ',0,' selon le paquet. Cuire ',2,' dans l’eau bouillante 9 minutes, refroidir, écaler et couper.'],
    ['Égoutter ',1,'. Couper ',4,', ',5,' et ',3,'. Râper ',6,'.'],
    ['Mélanger ',8,', ',9,', le jus de ',7,', ',10,' et ',11,'.'],
    ['Répartir tous les ingrédients dans les bols et ajouter la sauce au moment de servir.']]},
  11:{category:'viande',sides:[3],steps:[
    ['Couper ',1,' et ',2,' en carrés. Monter les brochettes en alternant avec ',0,'.'],
    ['Griller les brochettes à la poêle ou au gril 6 à 8 minutes, en vérifiant la cuisson à cœur.'],
    ['Rincer et égoutter ',3,'. Mélanger avec ',4,' émincée et ',5,' ciselé.'],
    ['Assaisonner les lentilles avec ',6,' et servir avec les brochettes.']]},
  14:{category:'viande',sides:[1],steps:[
    ['Cuire ',1,' selon le paquet. Émincer ',6,' ; réserver la moitié pour la salsa.'],
    ['Chauffer ',14,', cuire la moitié de l’oignon 2 minutes. Ajouter ',0,', ',10,', ',11,', ',12,', ',13,' et une partie de ',15,'. Cuire 6 à 8 minutes, en émiettant, jusqu’à cuisson à cœur.'],
    ['Rincer et égoutter ',2,' et ',3,'. Ajouter à la viande et cuire encore 3 à 4 minutes.'],
    ['Couper ',5,' et mélanger avec le reste de l’oignon, le jus de ',s(7,'1/2'),' et ',s(8,'1/2'),'.'],
    ['Mélanger ',9,' avec le jus de ',s(7,'1/2'),' et ',s(8,'1/2'),'. Couper ',4,'.'],
    ['Répartir le riz, le mélange de viande, la salsa, l’avocat et la sauce dans les bols ; ajouter le reste de l’assaisonnement.']]},
  17:{category:'poisson',sides:[6,7],steps:[
    ['Mélanger ',1,', ',2,' haché, le zeste de ',3,', ',4,' et ',s(5,'1/2'),'. Assaisonner avec une partie de ',8,'.'],
    ['Sécher ',0,' et couvrir avec la chapelure aux herbes. Cuire à l’Air Fryer à 200 °C pendant 10 à 12 minutes, jusqu’à cuisson à cœur.'],
    ['Couper ',6,' et ',7,'. Poêler à feu vif 8 minutes avec ',s(5,'1/2'),' et le reste de l’assaisonnement. Servir avec le poisson et le citron en quartiers.']]},
  18:{category:'viande',mode:'unit',label:'cordon bleu',sides:[8,9,10,11,12,13,14],steps:[
    ['Ouvrir ',0,' en portefeuille et aplatir légèrement. Répartir ',2,' et ',1,' à l’intérieur ; refermer avec des cure-dents.'],
    ['Préparer trois assiettes : ',5,' mélangée à ',6,', ',7,' et une partie de ',17,' ; ',4,' battu ; ',3,'. Paner les cordons bleus.'],
    ['Badigeonner avec ',s(16,'1/2'),'. Cuire à l’Air Fryer à 200 °C pendant 16 à 18 minutes ; retourner à mi-cuisson et vérifier la cuisson complète à cœur.'],
    ['Couper ',8,', ',9,', ',10,' et ',11,'. Émincer ',13,' et ',12,'. Chauffer ',s(16,'1/2'),', cuire l’oignon 2 minutes, puis aubergine et poivron 5 minutes.'],
    ['Ajouter courgette, tomates, ail, ',14,' et le reste de l’assaisonnement. Cuire encore 5 à 6 minutes. Retirer les cure-dents et servir avec ',15,' en quartiers.']]},
  20:{category:'viande',sides:[1],adjust:{12:['1/2','Persil en finition de trois assiettes de couscous : demi-botte proposée.']},steps:[
    ['Couper ',0,'. Émincer ',5,' et ',6,'. Faire revenir dans ',11,' pendant 3 minutes puis saisir le poulet 5 minutes.'],
    ['Ajouter ',8,', ',9,' et ',10,' pendant 30 secondes. Verser ',7,'.'],
    ['Couper ',3,' et ',2,' en bâtonnets, ajouter au bouillon et laisser mijoter 15 minutes.'],
    ['Ajouter ',4,' égouttés et cuire encore 5 minutes ; vérifier le poulet à cœur.'],
    ['Préparer ',1,' selon le paquet avec un peu du bouillon déjà prévu. Servir avec le poulet et les légumes, ',12,' et ',13,'.']]},
  23:{category:'viande',sides:[1,2],steps:[
    ['Assaisonner ',0,' avec ',4,', ',5,', ',3,' râpé, ',s(6,'1/2'),' et une partie de ',8,'.'],
    ['Cuire à l’Air Fryer à 200 °C pendant 18 à 20 minutes, en retournant à mi-cuisson. Vérifier la cuisson à cœur.'],
    ['Rincer ',1,' et couvrir de 1,5 fois son volume d’eau salée. Porter à ébullition puis cuire à couvert à feu doux 12 minutes.'],
    ['Couper ',2,' et poêler 6 à 8 minutes avec ',s(6,'1/2'),'. Servir avec le riz et le poulet ; presser ',7,' et ajouter le reste de l’assaisonnement.']]},
  24:{category:'vegetarien',sides:[3],choices:{2:'Épinards frais'},steps:[
    ['Préparer ',0,' de chair de potimarron en cubes de 2 cm. Émincer ',5,' et ',6,'. Rincer et égoutter ',1,'.'],
    ['Chauffer ',10,', cuire l’oignon 3 minutes. Ajouter l’ail, ',7,', ',8,' et ',9,' pendant 30 secondes.'],
    ['Ajouter le potimarron, ',4,' et ',11,'. Laisser mijoter à couvert 15 minutes.'],
    ['Cuire ',3,' selon le paquet. Ajouter les pois chiches au curry et cuire encore 5 à 7 minutes.'],
    ['Ajouter ',2,' et cuire jusqu’à évaporation de l’excès d’eau. Écraser quelques cubes pour lier la sauce, assaisonner avec ',12,' et ',13,' puis servir avec le riz.']]},
  25:{category:'vegetarien',steps:[
    ['Rincer ',0,' et ',1,'. Couper ',2,', ',3,' et ',4,'.'],
    ['Chauffer ',13,' et cuire carotte et courgette 4 à 5 minutes. Ajouter ',8,', ',s(9,'1/2'),', ',10,', ',11,' et ',12,' pendant 30 secondes.'],
    ['Ajouter ',5,' pendant 1 minute, puis les tomates, les lentilles et ',s(7,'10/11'),'. Laisser mijoter 12 à 15 minutes, en remuant.'],
    ['Réserver ',s(7,'1/11'),' pour ajuster progressivement la texture. Ajouter les pois chiches, cuire 5 minutes et vérifier que les lentilles sont fondantes.'],
    ['Mélanger ',6,' avec ',s(14,'1/2'),', ',s(9,'1/2'),' et une partie de ',15,'. Répartir le dahl et la sauce, puis ',s(14,'1/2'),' et le reste de l’assaisonnement.']]},
  28:{category:'viande',mode:'unit',label:'repas de deux fajitas',steps:[
    ['Couper ',1,', ',4,', ',2,' et ',3,'. Mariner le poulet avec ',10,', ',11,', ',s(12,'1/2'),' et une partie de ',13,' et ',14,'.'],
    ['Chauffer ',s(12,'1/2'),' et cuire poivrons et oignon 7 à 8 minutes. Ajouter le poulet et cuire encore 7 à 9 minutes jusqu’à cuisson à cœur ; détendre avec un peu d’eau si nécessaire.'],
    ['Mélanger ',8,' avec le jus de ',s(9,'1/2'),'. Garder ',s(9,'1/2'),' en quartiers pour le service.'],
    ['Couper ',5,', laver ',6,' et préparer ',7,'. Réchauffer ',0,' selon le paquet.'],
    ['Présenter les garnitures séparément. Répartir le reste de l’assaisonnement ; chacun garnit ses fajitas.']]},
  34:{category:'vegetarien',sides:[2],steps:[
    ['Rincer ',0,' et cuire 10 à 12 minutes. Égoutter très soigneusement et laisser tiédir. Râper ',1,', hacher ',7,' et ciseler ',8,'.'],
    ['Écraser les lentilles, mélanger avec carottes, ',3,', ',4,', l’ail, ',s(9,'1/2'),', ',10,', ',s(8,'1/2'),' et une partie de ',12,' et ',13,'.'],
    ['Former de petites galettes régulières. Chauffer ',11,' et cuire 4 à 5 minutes par face à feu moyen, jusqu’à ce qu’elles soient prises et dorées.'],
    ['Cuire ',2,' selon le paquet. Mélanger ',5,' avec le jus de ',s(6,'1/2'),', ',s(9,'1/2'),' et ',s(8,'1/2'),'.'],
    ['Servir les galettes avec le boulgour, la sauce et ',s(6,'1/2'),' en quartiers. Ajouter le reste de l’assaisonnement.']]},
  35:{category:'viande',sides:[0],choices:{11:'Persil frais'},steps:[
    ['Couper ',1,' et assaisonner avec ',8,', ',9,' et une partie de ',12,'. Couper ',2,', ',6,' et ',3,'.'],
    ['Dorer le poulet dans ',s(7,'1/2'),' pendant 5 à 7 minutes, jusqu’à cuisson à cœur ; réserver. Poêler les courgettes 5 à 6 minutes et l’ail pendant la dernière minute.'],
    ['Cuire ',0,' selon le paquet. Réserver un peu d’eau de cuisson puis égoutter. Dorer dans la poêle 4 à 5 minutes avec ',s(7,'1/2'),'.'],
    ['Remettre le poulet et les tomates séchées ; réchauffer 1 à 2 minutes. Mélanger ',4,', ',5,' et le jus de ',10,' avec un peu d’eau de cuisson.'],
    ['Couper le feu, attendre 30 secondes puis incorporer la sauce sans la faire bouillir. Ajouter ',11,' et le reste de l’assaisonnement ; servir.']]},
  40:{category:'viande',sides:[1,2,3,4],steps:[
    ['Préchauffer à 210 °C. Couper ',2,', ',3,', ',4,' et ',s(5,'1/2'),'. Mélanger avec ',s(14,'1/2'),' et une partie de ',15,'. Rôtir 30 à 35 minutes en retournant à mi-cuisson.'],
    ['Mélanger ',0,' avec ',s(5,'1/2'),' haché, ',s(6,'1/2'),', ',s(7,'1/2'),', ',s(8,'1/2'),', ',11,', ',s(12,'3/4'),' et ',13,'. Former de petites keftas régulières.'],
    ['Cuire dans ',s(14,'1/2'),' pendant 8 à 10 minutes, en retournant ; vérifier la cuisson à cœur.'],
    ['Verser ',1,' dans un saladier et couvrir du même volume d’eau bouillante. Laisser gonfler 5 minutes et égrainer. Ajouter ',s(7,'1/4'),' et ',s(8,'1/4'),'.'],
    ['Mélanger ',9,' avec le jus de ',s(10,'1/2'),', ',s(6,'1/2'),' et ',s(12,'1/4'),'. Servir avec ',s(10,'1/2'),' en quartiers, ',s(7,'1/4'),', ',s(8,'1/4'),' et le reste de l’assaisonnement.']]},
  42:{category:'poisson',sides:[1],adjust:{6:['1/2','Persil en finition de trois assiettes de pâtes : demi-botte proposée.']},steps:[
    ['Cuire ',1,' al dente et réserver une louche d’eau de cuisson. Couper ',2,'.'],
    ['Griller les courgettes 5 à 6 minutes dans ',s(8,'2/3'),' ; réserver. Dans la même poêle, chauffer ',s(8,'1/3'),', ',3,' et ',5,' pendant 30 secondes.'],
    ['Ajouter ',0,' et cuire 2 à 3 minutes, jusqu’à ce qu’elles soient roses et cuites. Déglacer avec le jus de ',s(4,'1/2'),'.'],
    ['Ajouter courgettes et pâtes. Lier hors du feu avec un peu d’eau de cuisson. Ajouter ',6,', ',7,' et ',9,'. Servir avec ',s(4,'1/2'),' en quartiers.']]},
  45:{category:'vegetarien',sides:[4],adjust:{3:['1/4','Menthe aromatique d’une omelette pour deux : quart de botte proposé.']},steps:[
    ['Couper ',1,' et poêler 4 minutes dans ',s(6,'1/2'),'. Battre ',0,' avec ',3,' et une partie de ',7,'.'],
    ['Verser sur les courgettes, cuire 3 minutes à feu moyen en remuant doucement le centre puis poursuivre jusqu’à la cuisson souhaitée.'],
    ['Émietter ',2,' sur l’omelette et replier. Servir avec ',4,' assaisonnée du jus de ',5,', ',s(6,'1/2'),' et le reste de l’assaisonnement.']]},
  46:{category:'viande',sides:[3,4,5],steps:[
    ['Couper ',1,' et battre ',0,' avec une partie de ',8,'. Chauffer ',s(6,'1/2'),' et ajouter les œufs et le jambon.'],
    ['Cuire à feu moyen 3 minutes, ajouter ',2,' et replier quand l’omelette est prise ; adapter la fin de cuisson.'],
    ['Préparer ',3,', ',4,' et ',5,'. Assaisonner avec ',s(6,'1/2'),', le jus de ',7,' et le reste de l’assaisonnement. Servir à côté de l’omelette.']]},
  47:{category:'vegetarien',sides:[3,4],adjust:{6:['1/4','Persil de salade pour deux : quart de botte proposé.']},steps:[
    ['Couper ',1,' en dés et cuire 5 minutes dans ',s(7,'1/2'),'. Battre ',0,' avec une partie de ',8,'.'],
    ['Verser les œufs sur le poivron et cuire à feu moyen 3 minutes ; ajouter ',2,' puis replier et adapter la fin de cuisson.'],
    ['Couper ',3,' et ',4,'. Assaisonner avec le jus de ',5,', ',6,', ',s(7,'1/2'),' et le reste de l’assaisonnement. Servir avec l’omelette.']]},
  50:{category:'poisson',sides:[3],steps:[
    ['Préchauffer le four à 180 °C. Couper ',1,' et ',2,' en fines rondelles.'],
    ['Préparer une feuille de papier cuisson par morceau de ',0,'. Répartir les légumes, placer le poisson et ajouter ',4,' puis ',5,'. Fermer les papillotes.'],
    ['Enfourner 15 minutes et vérifier que le poisson est cuit à cœur. Cuire ',3,' selon le paquet et servir en accompagnement.']]},
  51:{category:'poisson',sides:[0],steps:[
    ['Cuire ',0,' al dente ; réserver un peu d’eau de cuisson. Émincer ',6,', ',7,' et ',3,'.'],
    ['Chauffer ',8,' et cuire oignon et courgette 5 à 6 minutes. Ajouter l’ail, ',5,', ',9,' et une partie de ',10,'. Mijoter 8 minutes.'],
    ['Ajouter ',4,' pendant 2 minutes, puis ',1,' égoutté. Incorporer les pâtes et détendre avec un peu d’eau de cuisson.'],
    ['Ajouter ',2,' en morceaux hors du feu et le reste de l’assaisonnement ; servir.']]},
  55:{category:'poisson',sides:[4,1],steps:[
    ['Rincer ',4,' et cuire dans deux fois son volume d’eau pendant 12 minutes. Couper ',1,' en rondelles.'],
    ['Faire sauter les courgettes dans ',s(5,'1/2'),' avec ',2,' pendant 10 minutes ; ajouter ',3,' ciselée.'],
    ['Saisir ',0,' côté peau pendant 4 minutes avec ',s(5,'1/2'),', retourner et cuire 3 minutes. Vérifier la cuisson à cœur selon l’épaisseur et servir avec les courgettes et le quinoa.']]},
  57:{category:'poisson',sides:[0],steps:[
    ['Cuire ',0,' une minute de moins que le temps du paquet. Réserver de l’eau de cuisson avant d’égoutter. Hacher ',4,'. Égoutter ',1,' et ',3,'.'],
    ['Chauffer ',5,' et faire revenir l’ail 30 secondes sans coloration. Ajouter ',2,', ',6,', ',7,' et ',8,'. Mijoter 5 minutes.'],
    ['Incorporer le thon, cuire 2 minutes, puis ajouter les pâtes. Détendre progressivement avec un peu d’eau de cuisson et mélanger 1 minute.'],
    ['Répartir la mozzarella en morceaux ; couvrir 1 à 2 minutes à feu doux pour la faire fondre et servir.']]},
  58:{category:'poisson',sides:[1,2,3,4,5,6,7],steps:[
    ['Cuire ',1,' en morceaux dans l’eau bouillante pendant 20 minutes. Couper ',2,', ',3,', ',4,' et ',6,'.'],
    ['Chauffer ',s(12,'1/2'),' et cuire oignon, aubergine et poivron 6 minutes. Ajouter courgette, ',7,', ',5,', ',13,' et une partie de ',14,'. Mijoter 12 à 15 minutes.'],
    ['Mélanger ',8,', ',9,' et le zeste de ',s(11,'1/2'),'. Sécher ',0,', badigeonner de ',10,' et couvrir de chapelure.'],
    ['Préchauffer l’Air Fryer à 190 °C pendant 3 minutes. Cuire le poisson 8 à 12 minutes selon l’épaisseur, jusqu’à cuisson à cœur.'],
    ['Égoutter et écraser les pommes de terre avec ',s(12,'1/2'),' et le jus de ',s(11,'1/2'),'. Garder le citron zesté en quartiers pour le service. Détendre avec un peu d’eau de cuisson, ajouter le reste de l’assaisonnement et servir.']]},
  59:{category:'poisson',sides:[1,2,9],choices:{0:'Filets de colin'},steps:[
    ['Préchauffer à 210 °C. Couper ',1,' et mélanger avec ',s(8,'1/2'),', ',9,' et une partie de ',10,' et ',11,'. Cuire 30 à 35 minutes en retournant à mi-cuisson.'],
    ['Sécher ',0,' ; décongeler au préalable selon le paquet si nécessaire. Mélanger ',4,', ',5,', ',7,', ',s(8,'1/2'),' et le zeste de ',6,'.'],
    ['Badigeonner le poisson avec ',3,' et couvrir de chapelure. Après 15 à 20 minutes de cuisson des pommes de terre, enfourner le poisson 12 à 15 minutes sur une autre grille ; vérifier la cuisson à cœur.'],
    ['Cuire ',2,' à la vapeur 6 à 8 minutes. Servir avec le jus de citron et le reste de l’assaisonnement.']]},
  61:{category:'viande',sides:[1,2,3,4,5],steps:[
    ['Préchauffer à 210 °C. Couper ',2,', ',3,', ',4,' et ',5,'. Mélanger avec ',s(10,'1/2'),', ',s(8,'1/2'),', ',9,' et une partie de ',13,'. Rôtir 25 à 30 minutes, en remuant à mi-cuisson.'],
    ['Couper ',0,' et mariner avec ',s(10,'1/2'),', ',s(8,'1/2'),', ',7,' et le jus de ',s(6,'1/2'),'. Cuire à la poêle 7 à 9 minutes jusqu’à cuisson à cœur.'],
    ['Préparer ',1,' selon le paquet. Mélanger ',11,' avec le jus de ',s(6,'1/2'),' et ',12,'. Répartir tous les éléments et le reste de l’assaisonnement.']]},
  62:{category:'viande',sides:[1,2],choices:{1:'Penne',2:'Haricots verts frais'},steps:[
    ['Couper ',0,', émincer ',4,', hacher ',5,' et ',11,'. Porter l’eau des pâtes à ébullition.'],
    ['Chauffer ',9,' et dorer le poulet 4 à 5 minutes ; réserver. Cuire l’oignon 3 minutes, ajouter l’ail et ',10,' pendant 30 secondes.'],
    ['Déglacer avec ',6,'. Ajouter ',7,' et ',8,' ; réduire 2 à 3 minutes. Baisser le feu et incorporer ',3,'.'],
    ['Remettre le poulet et mijoter doucement 5 à 7 minutes, jusqu’à cuisson complète à cœur. Cuire ',1,' al dente et réserver de l’eau de cuisson.'],
    ['Cuire ',2,' à l’eau ou à la vapeur 7 à 10 minutes. Mélanger les pâtes avec la sauce, détendre avec l’eau réservée puis ajouter les haricots et le persil. Assaisonner avec ',12,' et ',13,' selon le goût.']]},
  67:{category:'viande',mode:'unit',label:'repas de deux quesadillas',adjust:{8:['1/2','Coriandre partagée entre guacamole et salsa de trois repas : demi-botte proposée.']},steps:[
    ['Couper ',0,' et mariner avec ',9,', ',10,', ',11,', ',12,' et une partie de ',13,'. Poêler 6 minutes puis vérifier la cuisson à cœur.'],
    ['Couper ',2,' et ',s(3,'1/2'),'. Ajouter au poulet et cuire 5 minutes. Écraser ',5,' avec le jus de ',s(7,'1/2'),' et ',s(8,'1/2'),'.'],
    ['Couper ',s(6,'2/3'),' en dés ; mélanger avec ',s(3,'1/2'),', ',s(8,'1/2'),' et le jus de ',s(7,'1/2'),'. Garder ',s(6,'1/3'),' en salade.'],
    ['Garnir ',1,' avec ',4,' et le poulet aux poivrons, replier et cuire 2 minutes par face dans une poêle sèche. Servir avec guacamole, salsa, tomates et le reste de l’assaisonnement.']]},
  69:{category:'viande',steps:[
    ['Maintenir ',5,' chaud. Couper ',1,' et ',2,' ; émincer ',4,'.'],
    ['Dorer la dinde 5 à 6 minutes dans ',s(7,'1/2'),' puis réserver. Ajouter ',s(7,'1/2'),' et cuire oignon et courgette 4 minutes.'],
    ['Ajouter ',0,' et mélanger 1 à 2 minutes. Verser le bouillon progressivement, une louche à la fois, pendant environ 18 minutes ; vérifier que le riz est tendre.'],
    ['Ajouter ',3,' environ 5 minutes avant la fin. Remettre la dinde et vérifier sa cuisson à cœur. Couper le feu, ajouter ',6,', le jus de ',8,' et ',10,'. Servir avec ',9,'.']]},
  70:{category:'vegetarien',adjust:{10:['1/4','Persil aromatique dans une salade de lentilles pour deux : quart de botte proposé.']},steps:[
    ['Rincer ',0,' et cuire sans sel avec ',5,' coupée et ',6,' pendant 18 à 20 minutes. Égoutter et retirer l’échalote et le laurier.'],
    ['Cuire ',1,' 6 minutes pour des œufs mollets ou 9 minutes pour des œufs durs. Refroidir et écaler.'],
    ['Émulsionner ',7,', ',8,', ',9,' et ',11,'. Mélanger aux lentilles tièdes avec ',2,', ',3,' et ',10,'.'],
    ['Répartir dans les assiettes, ajouter ',4,' émiettée et les œufs coupés.']]},
  71:{category:'viande',sides:[0],steps:[
    ['Cuire ',0,' al dente, égoutter et refroidir sous l’eau froide. Couper ',2,' et ',3,'.'],
    ['Mélanger les pâtes avec ',1,', tomates et mozzarella. Ajouter ',4,', mélanger et parsemer de ',5,' avant de servir.']]},
  72:{category:'viande',sides:[0],adjust:{6:['1/4','Basilic en finition d’une salade au pesto pour deux : quart de botte proposé.']},steps:[
    ['Cuire ',0,' al dente, égoutter et rincer à l’eau froide. Couper ',1,' et cuire à la poêle 4 minutes par face avec ',7,' et une partie de ',8,' ; vérifier la cuisson à cœur puis laisser tiédir.'],
    ['Couper ',2,' et ',3,'. Mélanger les pâtes avec ',4,', ',5,', les tomates, la mozzarella et le poulet. Ajouter ',6,' et le reste de l’assaisonnement ; servir frais.']]},
  73:{category:'viande',steps:[
    ['Rincer et égoutter ',0,'. Couper ',1,', ',2,' et ',3,'.'],
    ['Émietter ',4,' et ciseler ',5,'. Mélanger et assaisonner avec un peu de l’huile des tomates séchées.']]},
  77:{category:'viande',adjust:{8:['1/4','Basilic de finition pour trois assiettes : quart de botte proposé.']},steps:[
    ['Assaisonner ',0,' avec ',10,' et une partie de ',11,'. Poêler 4 à 5 minutes par face jusqu’à cuisson à cœur ; laisser reposer et trancher.'],
    ['Couper ',1,' en quartiers et griller 2 minutes par face. Torréfier ',4,' à sec 2 minutes.'],
    ['Mélanger ',9,', ',5,', ',6,' et le jus de ',7,' en vinaigrette. Répartir ',3,', le poulet et les pêches, puis ',2,' déchirée. Ajouter pignons, ',8,', vinaigrette et le reste de l’assaisonnement.']]},
  79:{category:'viande',sides:[0],steps:[
    ['Cuire ',0,' al dente puis égoutter et rincer à l’eau froide. Couper ',1,' et poêler 4 minutes par face avec ',5,' et une partie de ',6,' ; vérifier la cuisson à cœur.'],
    ['Couper ',2,' en deux. Mélanger les pâtes avec ',3,', ',4,', les tomates et le poulet tiédi. Ajouter le reste de l’assaisonnement et servir frais.']]},
  80:{category:'vegetarien',adjust:{5:['1/8','Persil en garniture d’une portion de salade : un huitième de botte proposé, pas une botte entière par personne.']},steps:[
    ['Rincer et égoutter ',0,'. Couper ',1,', ',2,' et ',3,'.'],
    ['Mélanger avec le jus de ',4,', ',7,', ',6,', ',5,' et ',8,'. Servir frais.']]},
  82:{category:'poisson',adjust:{6:['1/4','Persil de garniture d’une salade pour deux : quart de botte proposé.']},steps:[
    ['Rincer et égoutter ',1,'. Égoutter et émietter ',0,'. Couper ',2,', ',3,' et ',4,'.'],
    ['Mélanger le tout avec jus et zeste de ',5,', ',8,', ',7,', ',6,' et ',9,'. Servir frais.']]},
  83:{category:'vegetarien',adjust:{9:['1/4','Persil de finition pour deux portions de shakshuka : quart de botte proposé.']},steps:[
    ['Émincer ',3,', ',2,' et ',4,'. Faire revenir 5 minutes dans ',10,'. Ajouter ',5,', ',6,', ',7,' et ',8,' pendant 30 secondes.'],
    ['Ajouter ',1,' et ',11,'. Mijoter 10 minutes jusqu’à épaississement.'],
    ['Préparer ',0,' : former autant de puits que d’œufs, puis casser un œuf par puits. Couvrir et cuire 4 à 5 minutes, jusqu’à ce que le blanc soit pris ; prolonger si nécessaire.'],
    ['Ajouter ',9,' ciselé et servir directement à table.']]},
  88:{category:'viande',sides:[1,2,3],steps:[
    ['Couper ',1,' et ',2,' et poêler à feu vif avec ',5,' pendant 8 minutes.'],
    ['Ajouter ',3,' coupées en deux, ',4,' et ',6,'. Cuire encore 3 minutes.'],
    ['Répartir ',0,' pour former un steak par convive. Cuire à la poêle 3 à 4 minutes par face et vérifier la cuisson à cœur. Assaisonner avec ',7,' et servir avec les légumes.']]},
  91:{category:'vegetarien',sides:[0],choices:{1:'Épinards frais'},steps:[
    ['Cuire ',0,' al dente et réserver de l’eau de cuisson. Émincer ',7,' et ',6,'. Rincer et égoutter ',2,'.'],
    ['Chauffer ',8,' et cuire l’oignon 3 minutes puis ajouter l’ail et ',1,'. Faire évaporer l’excès d’eau.'],
    ['Mixer les haricots avec ',3,', ',s(4,'3/5'),', ',9,' et une partie de ',10,' et ',11,'. Détendre progressivement avec de l’eau de cuisson des pâtes jusqu’à consistance lisse.'],
    ['Réchauffer doucement la sauce avec les épinards, sans bouillir. Concasser et torréfier ',5,' à sec 2 minutes.'],
    ['Mélanger pâtes et sauce à feu doux. Répartir, ajouter les noix, ',s(4,'2/5'),' et le reste de l’assaisonnement.']]},
  92:{category:'viande',sides:[7,8,9,10,11],steps:[
    ['Couper ',0,' en tenders. Préparer trois assiettes : ',4,' avec ',5,', ',6,' et une partie de ',13,' ; ',3,' battus ; ',1,' avec ',2,'.'],
    ['Passer les tenders dans chaque assiette de panure. Cuire à l’Air Fryer à 200 °C pendant 12 à 14 minutes, en retournant à mi-cuisson ; vérifier la cuisson complète à cœur.'],
    ['Rincer ',7,', couvrir de 1,5 fois son volume d’eau salée et cuire à couvert à feu doux 12 minutes.'],
    ['Couper ',8,', ',9,', ',10,' et ',11,'. Poêler à feu vif dans ',12,' pendant 8 à 10 minutes. Servir avec le riz et les tenders ; ajouter le reste de l’assaisonnement.']]},
  95:{category:'viande',mode:'unit',label:'repas de deux wraps',steps:[
    ['Mélanger ',4,' avec ',5,' ciselée. Couper ',3,' et ',2,'.'],
    ['Répartir la sauce sur ',0,'. Ajouter les crudités et ',1,'. Rouler serré puis couper en deux pour servir.']]}
};
