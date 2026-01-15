// GarageMate - v0
const btnAdd = document.getElementById("btnAdd");

if (!btnAdd) {
  alert("btnAdd introuvable ❌ (index.html pas à jour)");
} else {
  btnAdd.addEventListener("click", () => {
    const name = prompt("Nom de l'objet ?");
    if (!name) return;

    alert(`OK ✅ Ajouté : ${name}\n(Prochaine étape: on sauvegarde et on gère les emplacements)`);
  });
}
