//console.log("Background running!?");

//listener for button click
chrome.action.onClicked.addListener(buttonClicked);
function buttonClicked() {
  chrome.tabs.query({ active: true, currentWindow: true}, function(tabs){
    const tab = tabs[0];
    parseQuery(tab, tab.url, '');
  });
}
				    

// through context menu
chrome.contextMenus.create({
  "title": "ebibIt for \"%s\" !",
  "id" : "id\"%s\"",
  "contexts": ["selection"],
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.selectionText){
    parseQuery(tab, info.frameUrl, info.selectionText);
  }
  else
    console.console.warn("No text is selected");
});


function parseQuery(tab, tabUrl, keyword ) {
  if (tabUrl) {
    const isPDF = tabUrl.endsWith(".pdf");
    if (isPDF) {
      // store url for download later
      chrome.storage.session.clear();
      chrome.storage.session.set({ pdfUrl: tabUrl });
      if (keyword === '') {
	// ping with title if searched without selection text
	keyword = tab.title.split(".pdf")[0];
      }
      pingGoogleScholar(keyword.replace(' ', '+'));
    } else
      console.error("Not a PDF. Unable to proceed");
    
  }
}


function pingGoogleScholar(keyword) {
  if (!keyword) {
    return;
  }
  fetch("https://scholar.google.com/scholar?oi=gsb95&output=gsb&hl=en&q=" + encodeURI(keyword))
    .then(response => {
      if (!response.ok) {
	throw new Error("Unable to fetch details from Google Scholar. Check response");
      }
      return response.text();
    })
    .then(response=>{
      var result = JSON.parse(response);
      if (result.r && result.r.length) {
	var paperId = result.r[0].l.f.u.replace('#f', '');
	searchForBibtex(paperId);
	
      }
    })
    .catch(error => {
      console.error("Error:" , error);
    });
}


function searchForBibtex(paperId) {
  fetch("https://scholar.google.com/scholar?output=gsb-cite&hl=en&q=info:" + paperId + "::scholar.google.com/")
    .then(response => {
      if (!response.ok) {
	throw new Error("Unable to fetch details from Google Scholar. Check response");
      }
      return response.text();
    })
    .then(response => {
      var retObj = JSON.parse(response);
      if (retObj && retObj.i[0].l == "BibTeX") {
	var bibTexUrl = retObj.i[0].u;
	// console.log(bibTexUrl);
	fetch(bibTexUrl)
	  .then(response => {
	    if (!response.ok) {
	      throw new Error("Not OK");
	    }
	    return response.text();
	  })
	  .then(response => {
	    const responseObj = parseBibTeX(response);
	    //console.log(response);
	    chrome.storage.session.set({ key: responseObj});
	    createNotification(response);
	  })
	  .catch(error => {
	    console.error("Error:" , error);
	  });	
      }
    })
    .catch(error => {
      console.error(error);
    });
}

  
function parseBibTeX(bibtex) {
  const entries = {};
  const lines = bibtex.split('\n');
  let currentEntry = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check for the start of a new entry
    if (trimmedLine.startsWith('@')) {
      const match = /@(\w+){(.*),/.exec(trimmedLine);
      if (match) {
	const entryType = match[1];
	const entryKey = match[2];
	currentEntry = { type: entryType, key: entryKey };
	entries['0'] = currentEntry;
      }
    }

    // Parse key-value pairs within an entry
    if (currentEntry) {
      const keyValueMatch = /(\w+)\s*=\s*{([^}]*)}/.exec(trimmedLine);
      if (keyValueMatch) {
	const key = keyValueMatch[1];
	const value = keyValueMatch[2];
	currentEntry[key] = value;
      }
    }
  }
  
  return entries;
}

  
  
function createNotification(response) {
  chrome.notifications.create({
    type: 'basic',
    title: 'ebibIt!',
    iconUrl: 'icons/icon.png',
    message: response,
    buttons: [{title: 'Add'}, {title: 'Cancel'}],
    requireInteraction: true,
  });
}


chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
  if (buttonIndex === 0) {
    chrome.storage.session.get(["key"]).then((result) => {
      result = result["key"][0];
      //console.log(result);
      fileName = result.year + result.author.replaceAll(/,/g,'')
        + '-' + result.title.replaceAll(/[^a-zA-Z ]/g, "");
      fileName = fileName.replaceAll(' ', '');
      const bibtexMessage = writeBibtex(result, fileName);
      communicationProtocol(bibtexMessage);			     
      chrome.storage.session.get(["pdfUrl"]).then((urlObj) => {
	downloadPDF(urlObj, fileName);
      });
    });					     
  }
  else {
    console.log("Cancelled adding to ebibdB!")
    return;
  }
});

	      
function downloadPDF(urlObj, fileName){
  const options = {
    url: urlObj['pdfUrl'],
    filename: 'ebibdB/' + fileName + '.pdf',
  };
  console.log(options.url);
  // Initiate the download
  chrome.downloads.download(options, function(downloadId){
    if (chrome.runtime.lastError) 
      console.error(chrome.runtime.lastError);
    else
      console.log("Downloading to:" + '{DOWNLOAD_FOLDER}/'+ options.filename);
  });
}
    
function writeBibtex(response, fileName) {
  bibtexString = '\n@' + response.type + '{'+ fileName + ',\n';
  for (const key in response)
    bibtexString = bibtexString.concat(key + '= {' + response[key] + '}, \n');
  bibtexString = bibtexString.concat("file={" + "~/database/pdfs/" + fileName + '.pdf}, \n');
  bibtexString = bibtexString.concat("keywords={}\n }");
  return bibtexString;
}

function communicationProtocol(message) {
  // Construct the protocol URL with message data
  const encodedData = encodeURIComponent(message);
  console.log(encodedData);
  const orgProtocolURL = `org-protocol://ebib-pdfBibtex-interface?url=${encodedData}`;

  // Open in new tab
  chrome.tabs.create({ url: orgProtocolURL}, (tab) => {
    if (chrome.runtime.lastError) 
      console.error(chrome.runtime.lastError);
    else
      console.log("Bibtex has been stored");
  });
}
