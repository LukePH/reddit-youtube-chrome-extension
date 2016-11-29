
var lastCheckedVideoId=null;
var checkedInterval=null;
var reloadCommentLayoutTimer=null;

var lastCommentSearch=null;
var shownCommentIndex=null;

//Ensure console.log functions are safe to use..
if (typeof console === "undefined"){
  console={};
  console.log = function(){return;}
  console.error = function(){return;}
}

function getParameterByName(name)
{
    return getParameterByNameFromString(name, location.search)
}
function getParameterByNameFromString(name, url)
{
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(url);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function logException(ex)
{
  console.error("Error: "+ ex.name + ": ", ex.message);
  console.error(ex); //TODO: this doesn't give a correct stacktrace
}



function findCommentInsertionPoint()
{
  return $("body #watch-discussion");
}

function setupCommentLayout(pageLoad)
{
  reloadCommentLayoutTimer=null;
  
  var target=findCommentInsertionPoint();
  
  if (target.length>0)
  {
    //Build up a layout around the target element
    target.wrap("<div id='extension-comments'><div class='extension-comment-wrapper' id='youtube-comments'><div class='container'></div></div></div>");
    $("#extension-comments").prepend("<div id='extension-comments-toolbar'></div>");
    
    $("#extension-comments").append("<div class='extension-comment-wrapper' id='reddit-comments'><div class='header'></div><div class='container'></div></div>");
    
    
    var toolbar=$("#extension-comments-toolbar");
    
    $(toolbar).append("<div id='extension-comments-switcher'>"+
                       "<a class='switcher-option' id='show-reddit-comments' href='#'>Reddit Comments</a>"+
                       "<a class='switcher-option' id='show-youtube-comments' href='#'>Youtube Comments</a></div>");
    
    
    $("#show-reddit-comments").click(function(){
      showTab($("#show-reddit-comments"), $("#reddit-comments"));
      return false;
    });
    
    $("#show-youtube-comments").click(function(){
      showTab($("#show-youtube-comments"), $("#youtube-comments"));
      return false;
    });
    
    showTab($("#show-reddit-comments"), $("#reddit-comments"));
    
    try
    {
      findRedditComments();
    }
    catch(e)
    {
      logException(e);
    }
  }
  else
  {
    if (pageLoad)
    {
      console.log("Didn't find comment insertion point");
    }
  }
}

function checkForChangedPage()
{
  /// Youtube uses ajax to switch pages, we need to check for this and reload
  setInterval(function()
  {
    try
    {
      if ( $("body #extension-comments").length==0 )
      {
        setupCommentLayout(false);
      }
    }
    catch(e) //Catch to ensure the interval timer doesn't stop
    {
      logException(e);
    }
  },500);
}

function showTab(link, tabDiv)
{
  $(".extension-comment-wrapper").hide();
  $(tabDiv).show();
  
  $("#extension-comments-switcher .switcher-option").removeClass("switcher-active");
  $(link).addClass("switcher-active");
}

function findRedditComments()
{
  var videoId=getParameterByName("v");
  lastCheckedVideoId=getParameterByName("v");
  
  youtubeUrl="http://www.youtube.com/watch?v="+getParameterByName("v");
  //searchUrl="https://www.reddit.com/submit.json?url="+youtubeUrl
  searchUrl="https://www.reddit.com/search.json?q=url:"+youtubeUrl;
  
  var header=$("#reddit-comments .header");
  var loadingImage=$("<img/>").attr("src",chrome.extension.getURL('images/loading-slide.gif') ).addClass("comment-loading-image") ;
  header.append( loadingImage );
  
  $.ajax({
    url: searchUrl,
    success: function(data)
    {
      
      var results=data["data"]["children"];
      
      lastCommentSearch=[];
      shownCommentIndex=0;
      
      var index;
      for (index = 0; index < results.length; ++index)
      {
        var result=results[index]["data"];
        var resultUrl=result["url"];
        resultUrl=resultUrl.replace("&amp;","&");
        var resultVideoId=getParameterByNameFromString("v", resultUrl);
        if (resultVideoId!=null)
        {
          if (resultVideoId.trim() == videoId)
          {
            lastCommentSearch.push(result)
          }
          else
          {
            console.log("Returned url of:"+result["url"]+" does not match this video, v is:"+getParameterByNameFromString("v", result["url"])+"!="+videoId  );
          }
        }
      }
      
      if (lastCommentSearch.length==0)
      {
        var header=$("#reddit-comments .header");
        header.empty();
        header.append( $("<h1 class='post-title'></h1>").text( "No posts found for this video" ) );
        header.append( $("<h1 class=''></h1>").append( $("<a></a>").text("Start a new reddit post here").attr('href', "https://www.reddit.com/submit?url="+youtubeUrl) ) );
        showTab($("#show-youtube-comments"), $("#youtube-comments")); //switch to youtube comments (needs to be setting)
        return;
      }
      
      showRedditCommentsByIndex(shownCommentIndex);
      
    },
    error:function(jqXHR, textStatus, errorThrown)
    {
      console.log("--findRedditComments failed--");
      console.log("jqXHR:"+jqXHR);
      console.log("textStatus:"+textStatus);
      console.log("errorThrown:"+errorThrown);
      
      //show error
      var header=$("#reddit-comments .header");
      header.empty();
      
      var container=$("#reddit-comments .container");
      container.empty();
      container.append( $("<h2 class='comments-error'></h2>").text( "Failed to search Reddit" ));
      
    }
  });
}

function showRedditCommentsByIndex(commentIndex)
{
  var post=lastCommentSearch[commentIndex];
  var url="https://www.reddit.com"+post["permalink"];
  
  try
  {
    var header=$("#reddit-comments .header");
    header.empty();
    
    //Setup title..
    var title=post["title"];
    title=title.replace("&amp;","&");
    
    var headerLink=$("<a></a>").text( title ).attr('href', url)
    header.append( $("<h2 class='post-title'></h2>").append(headerLink) );
    
    //Setup info..
    var postInfo=$("<div class='post-options'></div>");
    var subredditLink=$("<a></a>").attr('href', "https://reddit.com/r/"+post["subreddit"]).text("r/"+post["subreddit"])
    postInfo.append( subredditLink );
    header.append(postInfo);
    
    //Setup threads nav..
    
    var postOptions=$("<div class='post-options'></div>");
    //var link=$("<a></a>").attr('href', "https://reddit.com/r/"+post["subreddit"]).text("r/"+post["subreddit"])
    var navSpan=$("<span></span>");
    navSpan.append("Threads: ( ");
    if (lastCommentSearch.length<=1)
    {
      navSpan.append("No others");
    }
    else
    {
      if ( (commentIndex+1)>1 )
      {
        navSpan.append(" ");
        var prevLink=$("<a>Prev</a>");
        prevLink.click(function(){
          showRedditCommentsByIndex(commentIndex-1);
          return false;
        });
        navSpan.append(prevLink);
        navSpan.append(" ");
      }
      var i;
      for (i = 0; i < lastCommentSearch.length; ++i)
      {
        navSpan.append(" ");
        var indexLink=$("<a class='commentIndex' href='#'></a>").text(i+1).data("index",i);
        if (i==commentIndex)
        {
          indexLink.addClass("activeIndex");
        }
        indexLink.click(function(){
          showRedditCommentsByIndex($(this).data("index"));
          return false;
        });
        navSpan.append(indexLink);
        navSpan.append(" ");
      }
      if ( (commentIndex+1)<lastCommentSearch.length)
      {
        navSpan.append(" ");
        var nextLink=$("<a>Next</a>");
        nextLink.click(function(){
          showRedditCommentsByIndex(commentIndex+1);
          return false;
        });
        navSpan.append(nextLink);
        navSpan.append(" ");
      }
    }
    navSpan.append(" )");
    
    postOptions.append( navSpan );
    
    
    
    header.append(postOptions);
  }
  catch(e) //The comments matter more then the header, header might fail if incomplete data is returned
  {
    logException(e);
  }
  
  setRedditComments(url)
}

function setRedditComments(url)
{
  var container=$("#reddit-comments .container");
  container.empty(); //TODO: Loading gif here
  
  var loadingImage=$("<img/>").attr("src",chrome.extension.getURL('images/loading-slide.gif') ).addClass("comment-loading-image") ;
  container.append( loadingImage );
  
  $.ajax({
    url: url,
    success: function(data)
    {
      
      var returnedPage=$(data);
      
      //remove all scripts from data
      returnedPage.find('script').remove();
      
      
      //remove features that aren't yet supported.. TODO: support them
      returnedPage.find('.report-button').remove();
      returnedPage.find('.give-gold').remove();
      returnedPage.find('a').filter(function(index) { return $(this).text() === "reply"; }).remove();
      returnedPage.find('a.bylink').filter(function(index) { return $(this).text() === "parent"; }).remove();
      
      returnedPage.find('.arrow.up').remove();
      returnedPage.find('.arrow.down').remove();
      
      var comments=$(returnedPage).find(".nestedlisting");
      var container=$("#reddit-comments .container");
      container.empty();
        
      if (comments.length>0)
      {
		comments.html(comments.html().replace(/href\="\/r\//g, 'href="https://www.reddit.com/r/'));
		  
        container.append(comments);
      }
      else
      {
        container.append( $("<h1 class='comments-error'></h1>").text( "Reddit returned unexpected page:" ));
        
        var over18=$(returnedPage).find(".over18");
        if (over18.length>0)
        {
          returnedPage.find('.pretty-form').remove(); //remove till supported directly so users aren't confused
          
          container.append(over18);
        }
        else
        {
          container.append(returnedPage);
        }
      }
      
      //TODO: get comment count here maybe
      
    },
    error:function(jqXHR, textStatus, errorThrown)
    {
      console.log("--setRedditComments failed--");
      console.log("jqXHR:"+jqXHR);
      console.log("textStatus:"+textStatus);
      console.log("errorThrown:"+errorThrown);
      
      //show error
      var container=$("#reddit-comments .container");
      container.empty();
      container.append( $("<h2 class='comments-error'></h2>").text( "Failed to load Reddit comment page" ));
      
    } 
  });
}

setupCommentLayout(true);
checkForChangedPage();



