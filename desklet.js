const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;

const Tooltips = imports.ui.tooltips;
const PopupMenu = imports.ui.popupMenu;
const Cinnamon = imports.gi.Cinnamon;
const Soup = imports.gi.Soup
let session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

//const DEBUG=true;
const DEBUG=false;

function MyDesklet(metadata){
    this._init(metadata);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    download_file: function(url, filename, callback) {
        
        if(DEBUG==true) global.log("In download_file");
        if(filename !== null){
	    let outFile = Gio.file_new_for_path(filename);
            var outStream = new Gio.DataOutputStream({base_stream:outFile.replace(null, false, Gio.FileCreateFlags.NONE, null)});
	}
	var message = Soup.Message.new('GET', url);
        session.queue_message(message, function(session, response) {
	    if (response.status_code !== Soup.KnownStatusCode.OK) {
               global.log("Error during download: response code " + response.status_code
                  + ": " + response.reason_phrase + " - " + response.response_body.data);
               callback(false, null);
               return true;
            }

            if(filename !== null){
              try {
		    Cinnamon.write_soup_message_to_stream(outStream, message);
                    outStream.close(null);
	      }
              catch (e) {
                 global.logError("Error was:");
                 global.logError(e);
                 callback(false, null);
                 return true;
              }
	    }else{
	      callback(true, response.response_body.data);
	      return false;
	    }

            callback(true, filename);
	    return false;
         });
    },

    refresh: function(garfieldid) {
        if (this.updateInProgress) return true;
        this.updateInProgress = true;
        
        let url;

        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
        }

        url = 'http://www.gocomics.com/garfield/';
        if(garfieldid!==null)
	  url+=garfieldid;
	if(DEBUG==true) global.log("Downloaded url = "+ url);
	this.download_file(url, null, Lang.bind(this, this.on_html_downloaded));
        
        return true;
    },

    on_html_downloaded: function(success, data, cached) {
        if (success) {
	   if(DEBUG==true) global.log("Downloaded_html_file");
           
	   var image=null;
	   
	   exp = new RegExp("(\\d{4}/\\d{2}/\\d{2})\" class=\"prev\"");
	   match = exp.exec(data);
	   if (match != null) {
             this.previousIdentifier = match[1];
	   }

	   exp = new RegExp("class=\"strip\" src=\"([^\"]+)\\?width[^\"]+\"");
           match = exp.exec(data);
           if (match != null) {
              image = match[1];
           } else {
              exp = new RegExp("<link rel=\"image_src\" href=\"([^\"]+)\"");
              match = exp.exec(data);
              if (match != null) {
                image = match[1];
              }
	   }
             
	   if(image !== null){
	     if(DEBUG==true) global.log("Image " + image);
	     let idx = image.lastIndexOf('/');
	     let imgFilename = this.save_path + '/' + image.substr(idx+1);
	     if(DEBUG==true) global.log("Save Path " + imgFilename );
	     this.download_file(image, imgFilename, Lang.bind(this, this.on_garfield_downloaded));
	   }
        }
        else {
            //global.log('No joy, no json');
        }
        return true;
    },
    tweener_done:function(file){
      this.updateInProgress = false;
      if(DEBUG==true) global.log("Tweener Done");
      if (this._clutterTexture.set_from_file(file)) {
        this._photoFrame.set_child(this._clutterBox);
      }
      Tweener.addTween(this._clutterTexture, { opacity: 255,
	  time: this.metadata["fade-delay"],
	  transition: 'easeInSine',
	  });
      this.scale_image(); 
    },
    on_garfield_downloaded: function(success, file, cached) {
        var width,height;
        if(success===true){
	  if(DEBUG==true) global.log("Downloaded_image_file");
          Tweener.addTween(this._clutterTexture, { opacity: 0,
            time: this.metadata["fade-delay"],
            transition: 'easeInSine',
            onComplete: Lang.bind(this, this.tweener_done(file))
	  });
	  if(DEBUG==true) global.log("Downloaded_image_file Done");
	}
    },

    _init: function(metadata){
        try {            
            Desklet.Desklet.prototype._init.call(this, metadata);
            this.metadata = metadata
            this.updateInProgress = false;

	    this.setHeader(_("garfield"));

            this._photoFrame = new St.Bin({style_class: 'garfield-box', x_align: St.Align.START});
            this._binLayout = new Clutter.BinLayout();
            this._clutterBox = new Clutter.Box();
            this._clutterTexture = new Clutter.Texture({
                keep_aspect_ratio: true, 
                filter_quality: this.metadata["quality"]});
            this._clutterTexture.set_load_async(true);
            this._clutterBox.set_layout_manager(this._binLayout);
            this._clutterBox.set_width(this.metadata["width"]);
            this._clutterBox.add_actor(this._clutterTexture);
            this._photoFrame.set_child(this._clutterBox);            
            this.setContent(this._photoFrame);

            
            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._menu.addAction(_("View latest garfield"), Lang.bind(this, function() {
                this.refresh(null);
            }));
            this._menu.addAction(_("Open save folder"), Lang.bind(this, function() {
                Util.spawnCommandLine("xdg-open " + this.save_path);
            }));

            let dir_path = this.metadata["directory"];
            this.save_path = dir_path.replace('~', GLib.get_home_dir());
            let saveFolder = Gio.file_new_for_path(this.save_path);
            if (!saveFolder.query_exists(null)) {
                saveFolder.make_directory_with_parents(null);
            }
                       
            this.updateInProgress = false;

            this.refresh(null);
            
            global.w = this._photoFrame;
            this._stage = Clutter.Stage.get_default ();
        }
        catch (e) {
            global.logError(e);
        }
        return true;
    },

    _update: function(){
        try {
            this.refresh(this.previousIdentifier);
        }
        catch (e) {
            global.logError(e);
        }
    },

    on_desklet_clicked: function(event){  
        try {
            if (event.get_button() == 1) {
                this._update();
            }
        }
        catch (e) {
            global.logError(e);
        }
    }
}

function main(metadata, desklet_id){
    let desklet = new MyDesklet(metadata);
    return desklet;
}
