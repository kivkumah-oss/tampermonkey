// ==UserScript==
// @name         Update Test
// @namespace    https://github.com/kivkumah-oss
// @version      1.1
// @description  Testing GitHub auto updates
// @author       Martin
// @updateURL    https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// @downloadURL  https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/UpdateTest.user.js
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log("Update Test v1.1");

    if (!document.getElementById("martin-update-test")) {

        const div = document.createElement("div");

        div.id = "martin-update-test";

        div.style.position = "fixed";
        div.style.bottom = "20px";
        div.style.right = "20px";
        div.style.padding = "12px 18px";
        div.style.background = "#7c4dff";
        div.style.color = "white";
        div.style.borderRadius = "12px";
        div.style.fontWeight = "bold";
        div.style.zIndex = "999999";

        div.textContent = "Version 1.0";

        document.body.appendChild(div);

    }

})();
