

// Get the modal
var modal = document.getElementById('myModal');

// Get the button that opens the modal
var btn = document.getElementById("chatbot-button");

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];

// When the user clicks the button, open the modal
btn.onclick = function() {
    modal.style.display = "block";

    removeElementsByClass("segments");

    var initated = document.getElementsByClassName("initiated");
    if(initated.length == 0){
        setAttributeClasstoClass("chatbot", "initiated");
        ConversationPanel.init();
    } else {
      Api.sendRequest( '', null );
    }


}

// When the user clicks on <span> (x), close the modal
span.onclick = function() {
    modal.style.display = "none";

}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function removeElementsByClass(className){
    var elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
}

function setAttributeClasstoClass(className, attrClass){
    var elements = document.getElementsByClassName(className);
    for(i=0; i<elements.length; i++){
        //elements[i].setAttribute("class", attrClass);
        //elements[i].setAttribute("class", attrClass);
        elements[i].classList.add(attrClass);
    }
}
